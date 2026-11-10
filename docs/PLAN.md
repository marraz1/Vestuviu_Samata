# Vestuvių sąmata: full website implementation plan

## Context
The repo `marraz1/Vestuviu_Samata` is empty apart from a README. The requirements doc "Vestuvių išlaidų sekimo svetainė – reikalavimų dokumentas" defines a wedding budget and expense tracker: budget, categories, expenses, payments, forecast with guest count, suppliers, documents, roles and invites, payment calendar, seating, funding sources and debts, history, reports and export. The UI is in Lithuanian, the currency is EUR, and mobile comes first.

Decisions taken with the user:
- **Scope:** every phase (MVP, phase 2, phase 3). "Later" items (budget scenarios F22, English, PWA) stay out.
- **Hosting:** GitHub Pages, so the site is a static SPA.
- **Backend:** Neon Postgres + Neon Auth (managed Better Auth, email + password only) + Neon Data API, with row-level security (RLS) for access control.
- **Seating:** the full plan (tables, seats, guests, assignment).
- **Reminders:** in-app warnings only, no emails (F16 is reduced to on-screen alerts).

## Architecture
- **Frontend:** Vite + React 18 + TypeScript, `react-router` with `HashRouter` (Pages can't rewrite paths), TanStack Query for data, Tailwind CSS for mobile-first UI, Recharts for charts, react-hook-form + zod for forms.
- **Data access:** `@neondatabase/neon-js` client (auth + Data API, PostgREST-style queries). The JWT carries the user, and Postgres RLS uses `auth.user_id()` to enforce who sees which wedding. Only the public Data API URL and the Auth URL ship to the browser, as `VITE_*` vars. No secrets reach the client.
- **Money:** every amount is stored as integer cents (`bigint`) and formatted with `Intl.NumberFormat('lt-LT', {style:'currency', currency:'EUR'})`, which gives "1 250,00 €". Dates use `lt-LT`.
- **Calculations:** pure TypeScript in `src/domain/` with no I/O and unit tests (Vitest). Every screen and report uses this one module.
- **Concurrency:** each row has an `updated_at` column. An update sends `.eq('updated_at', loaded)`, and if 0 rows change the app shows "Kažkas pakeitė šį įrašą – perkrauti / perrašyti". This is "last save wins, with a warning".
- **Deploy:** GitHub Actions workflow `.github/workflows/deploy.yml` (on push to `main`): `npm ci && npm test && npm run build`, then `actions/deploy-pages`. Vite `base: '/Vestuviu_Samata/'`. The two `VITE_` URLs are stored as repo variables. Note: Pages on a private repo needs a paid GitHub plan, otherwise the repo must be public. The code holds no secrets, so making it public is safe.

## Database (`db/migrations/*.sql`, applied in order with Neon MCP `run_sql` / psql)
Tables (all `id uuid`, `created_at`, `updated_at`, `wedding_id` FK where relevant):
- `weddings`: name, date, venue, guest_count, total_budget_cents, reserve_pct, currency
- `wedding_members`: wedding_id, user_id, role (`owner|partner|editor|viewer`), funding_source_id (viewer's own share)
- `invitations`: wedding_id, email, role, token, accepted_at
- `categories`: name, limit_type (`amount|percent`), limit_value, color, sort_order, calc_hint
- `suppliers`: name, contact_person, phone, email, website, contract_status, rating 1–5, notes
- `expenses`: category_id, supplier_id, title, calc_type (`fixed|per_guest|hourly|per_unit|per_table`), unit_price_cents, quantity, fixed_part_cents, planned_cents, contracted_cents, status (`idea|offer|contract|partly_paid|paid|cancelled`; the doc's "Apsėta" is read as "Pasiūlymas gautas"), private_notes, notes, extra fees (vat_pct, service_fee_cents) for F14
- `payments`: expense_id, kind (`deposit|interim|final`), amount_cents, due_date, paid_date, method (`cash|transfer|card`), paid_by_source_id, is_paid
- `funding_sources`: name (Pora, tėvų įnašas, dovanos…), type, pledged_cents, received_cents
- `expense_funding`: expense_id, funding_source_id, share_pct | amount_cents (who finances what, F12/F13)
- `documents`: owner type (expense|supplier), owner_id, storage_key, file_name, mime, size, uploaded_by
- `comments`: expense_id, author_id, body
- `audit_log`: table_name, row_id, wedding_id, actor_id, action, diff jsonb. A generic trigger on the main tables fills it (F18 history).
- `tables`: name, seats, cost_cents. `guests`: name, attending, table_id, is_child, needs_lodging.

RLS: helper `is_member(wedding_id, roles[])`, a `SECURITY DEFINER` SQL function. Policies:
- Owner and partner can do everything; only the owner can delete a wedding.
- An editor can read and write expenses, payments, suppliers, documents and comments, but the policy for editors exposes expenses through a view `expenses_public` without `private_notes`.
- A viewer can only `select` from summary views and their own funding source.
- RPCs (`SECURITY DEFINER`): `create_wedding_with_defaults()` inserts the wedding, makes the owner a member and seeds the 24 categories from section 4. `accept_invitation(token)` checks that the JWT email matches and then adds the member. `delete_my_data()` / `export_my_wedding()` cover GDPR.
- Guest count lives only on `weddings` (risk from section 10). The per-guest cost is always derived from it, never copied. If the seating plan exists, attending guests can optionally override the count via a "naudoti tikslų sąrašą" toggle.

Documents (F9): Neon storage bucket (private) + presigned upload/download URLs. **Check first** that this works from the browser with Neon Auth. If it doesn't, fall back to a `bytea` column with a 5 MB limit, encrypted with pgcrypto. Allowed types are PDF/JPG/PNG.

## Domain logic (`src/domain/`)
- `forecast.ts`: `expenseForecast(e, guests)` = contracted ?? planned. For `per_guest` it is unit × guests (+ fixed part for "fiksuota + vienam svečiui"), for `per_table` it is unit × table count, then extra fees are added. `weddingForecast` = sum of non-cancelled expenses + reserve (reserve_pct × budget).
- `budget.ts`: category limit (amount or % of total), usage %, difference per category and overall.
- `payments.ts`: paid, remaining = contracted − paid, upcoming (≤ 7 days), overdue, monthly calendar buckets until the wedding date.
- `warnings.ts`: category at 80 % and 100 %, total forecast > budget, payment due in ≤ 7 days or overdue, more than N expenses without a contract when < 90 days remain. Each returns `{level: 'green'|'yellow'|'red', message}`.
- `funding.ts`: who paid how much, who still owes whom (F13), shortfall.
- `guests.ts`: cost per guest, and a sensitivity table for the cost at N ± 10/20 guests (report 5).
- `money.ts`, `format.ts`: cents helpers and `lt-LT` formatting.
- Tests for each of these in `src/domain/*.test.ts`.

## Screens (`src/routes/`, Lithuanian UI copy in `src/i18n/lt.ts`)
1. **Prisijungimas / Registracija:** email + password (Neon Auth), password reset.
2. **Pradžia (suvestinė):** 5 KPI tiles (budget, forecast, spent/contracted, paid, remaining), "liko X dienų", upcoming and overdue payments, warnings list. A floating "+" button opens quick add.
3. **Išlaidos:** list or cards with search, filters (category, status, supplier, date, amount) and sorting (F17). **Quick add** is a bottom sheet with only title + category + amount required, so an expense can be added in ≤ 30 s.
4. **Išlaidos kortelė:** all fields, payment schedule editor, documents, comments, history tab.
5. **Kategorijos:** limits, used %, horizontal bars; add, edit, delete and reorder.
6. **Mokėjimų kalendorius:** month view with due dates and totals per month.
7. **Tiekėjai:** list, card with contacts, contract status, rating and linked expenses.
8. **Svečiai ir sodinimas:** guest count, guest list, tables, drag/tap a guest to a table, cost per table and per guest.
9. **Finansavimas:** funding sources, who finances what, who owes whom.
10. **Ataskaitos ir eksportas:** the 5 reports from section 5 (a bar chart for category vs forecast vs actual), Excel/CSV export (SheetJS `xlsx`), and a PDF summary (`jspdf` + `jspdf-autotable`, with a font that supports Lithuanian letters).
11. **Nustatymai:** wedding data, members and invitations (generate an invite link to copy and send manually, since there is no email), category management, "eksportuoti / ištrinti visus duomenis".

UI principles: green, yellow and red status chips; the € sign always shown; deletions need confirmation and offer a 10 s "Atšaukti" undo toast (soft delete + restore); works at 360 px width; WCAG AA (contrast, focus rings, labels, keyboard navigation, `aria-live` for toasts).

## Build order (each step is a commit on `claude/nifty-hopper-7kubi3`)
1. Scaffold: Vite/React/TS, Tailwind, ESLint, Vitest, router, layout with bottom nav (mobile) and sidebar (desktop), `lt` strings, Pages deploy workflow.
2. Neon: create the project, enable Neon Auth + Data API, migrations 001 (schema), 002 (RLS + helpers), 003 (RPCs + seed categories), 004 (audit triggers, views).
3. Domain module + tests.
4. MVP screens: auth, create wedding, dashboard, categories, expenses + quick add, expense card with payments, in-app warnings.
5. Phase 2: suppliers, documents, invitations and roles, payment calendar, export (Excel/CSV/PDF).
6. Phase 3: seating, funding sources and debts, comments, history.
7. Polish: a11y pass, delete with undo, conflict warning, empty states, README with setup steps.

## Critical files
`package.json`, `vite.config.ts`, `.github/workflows/deploy.yml`, `db/migrations/00x_*.sql`, `src/lib/neon.ts` (client), `src/domain/*`, `src/routes/*`, `src/components/*` (KpiTile, MoneyInput, StatusChip, QuickAddSheet, ConfirmUndo), `src/i18n/lt.ts`, `README.md`.

## Verification
- `npm test`: domain tests cover forecast with guest changes, % limits, reserve, cancelled expenses excluded, remaining amount, 7-day/overdue rules, 80/100 % warnings, monthly buckets, debts.
- RLS check via Neon MCP `run_sql` with two test users: a non-member gets 0 rows, a viewer can't insert, an editor can't see `private_notes`, a partner can't delete the wedding.
- `npm run build && npx vite preview`, then a Playwright script at a 360 px viewport: register, create a wedding, quick-add an expense, add a payment, change the guest count and check that the forecast updates, check that warnings appear, export files download.
- Push and confirm the Pages workflow deploys and the live URL logs in against Neon.

## What the user must do
- Enable GitHub Pages (Source: GitHub Actions) and add repo variables `VITE_NEON_AUTH_URL` and `VITE_NEON_DATA_API_URL`. I'll give the values.
- Make the repo public, or use a paid plan for Pages on a private repo.
