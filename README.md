# Vestuvių sąmata

Website for planning a wedding budget, tracking expenses and payments, and seeing the forecast final cost. The UI is Lithuanian and the currency is EUR.

- Requirements: the doc "Vestuvių išlaidų sekimo svetainė – reikalavimų dokumentas"
- Implementation plan: [docs/PLAN.md](docs/PLAN.md)

## Stack

- **Frontend:** Vite + React + TypeScript + Tailwind, static, hosted on GitHub Pages
- **Backend:** Neon Postgres + Neon Auth (email + password) + Neon Data API; access rules are Postgres row-level security
- **Calculations:** `src/domain/`, pure functions with unit tests

## Development

```bash
npm install
cp .env.example .env.local   # fill in the Neon URLs
npm run dev
npm test                     # domain unit tests
npm run test:db              # migrations + RLS checks on an in-memory Postgres
npm run test:api             # live checks against Neon Auth + Data API
npm run test:ui              # browser smoke test at 360px (needs `vite preview` on :4173)
npm run build
```

## What works now (MVP)

- Sign-up, login, password reset by email (Neon Auth, email + password)
- Creating a wedding: date, guest count, budget; the 22 categories are added automatically
- **Pradžia:** budget, forecast, contracted, paid, remaining; days left; warnings; upcoming payments
- **Išlaidos:** search, filters, sorting; quick add "+" (title, category, amount)
- **Expense card:** pricing (fixed, per guest, per hour, per unit, per table), VAT, fees, contracted amount, status, notes, payment schedule, private notes (couple only), delete with undo, a warning when someone else saved first
- **Kategorijos:** limits as an amount or a %, usage bars
- **Mokėjimai:** monthly calendar up to the wedding
- **Nustatymai:** wedding data, guest count (forecasts recalculate), reserve %, JSON export, delete all data, accepting invitations (`#/kvietimas/<token>`)

## Database

Neon project **vestuviu-samata** (`raspy-fog-31716452`, Frankfurt, Postgres 18), branch `main`. Neon Auth is email + password only. Allowed origins: `https://marraz1.github.io` and localhost. Migrations 001–003 are applied.

SQL migrations live in `db/migrations/` and are applied in order to the Neon database:

| File | Contents |
| --- | --- |
| `001_schema.sql` | Tables. Money is stored as integer cents |
| `002_rls.sql` | Row-level security by role (owner, partner, editor, viewer) |
| `003_functions.sql` | Wedding creation with the default categories, invitations, GDPR export and deletion, change history |

## Deploying to GitHub Pages

1. Repo Settings → Pages → Source: **GitHub Actions**.
2. The Neon URLs are built into the workflow. To point at another project, set the repo variables `VITE_NEON_AUTH_URL` and `VITE_NEON_DATA_API_URL`.
3. Every push to `main` builds, tests and publishes (`.github/workflows/deploy.yml`).

Pages on a private repo needs a paid GitHub plan. The code contains no secrets, so the repo can be public.
