-- 003: RPCs (called through the Data API as /rpc/<name>) and the audit trigger.

-- JWT email claim, used to match invitations
create or replace function auth_email() returns text language sql stable as $$
  select lower(coalesce(current_setting('request.jwt.claims', true)::json ->> 'email', ''))
$$;

-- Creates a wedding, makes the caller the owner and seeds categories + funding sources
create or replace function create_wedding_with_defaults(
  p_name text, p_date date, p_guest_count int, p_budget_cents bigint, p_display_name text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare w uuid; i int := 0; c text[];
begin
  if auth.user_id() is null then raise exception 'not authenticated'; end if;
  insert into weddings (name, wedding_date, guest_count, total_budget_cents)
    values (p_name, p_date, coalesce(p_guest_count, 0), coalesce(p_budget_cents, 0))
    returning id into w;
  insert into wedding_members (wedding_id, user_id, email, display_name, role)
    values (w, auth.user_id(), auth_email(), p_display_name, 'owner');

  -- name, calculation hint, colour (section 4 of the requirements)
  foreach c slice 1 in array array[
    ['Vieta', 'Fiksuota + kaina vienam svečiui', '#0f766e'],
    ['Maistas ir gėrimai', 'Kaina vienam svečiui', '#b45309'],
    ['Alkoholis', 'Kaina vienam svečiui (arba pagal butelius)', '#9f1239'],
    ['Barmenas ir baras', 'Pagal valandas arba fiksuota', '#7c2d12'],
    ['Sodinimas ir stalai', 'Kaina vienam stalui / svečiui', '#4d7c0f'],
    ['Dekoras ir gėlės', 'Fiksuota pagal pozicijas', '#be185d'],
    ['Vedėjas', 'Fiksuota arba pagal valandas', '#6d28d9'],
    ['Fotografas', 'Fiksuota arba pagal valandas', '#1d4ed8'],
    ['Videografas', 'Fiksuota arba pagal valandas', '#0369a1'],
    ['Muzika ir pramogos', 'Pagal valandas + įrangos nuoma', '#7e22ce'],
    ['Ceremonija', 'Fiksuota', '#a16207'],
    ['Bažnyčios paslaugos', 'Fiksuota pagal pozicijas', '#854d0e'],
    ['Apranga ir šukuosena', 'Fiksuota pagal pozicijas', '#db2777'],
    ['Žiedai ir aksesuarai', 'Fiksuota', '#ca8a04'],
    ['Tortas ir desertai', 'Fiksuota + kaina vienam svečiui', '#c2410c'],
    ['Kvietimai ir popierius', 'Kaina vienam vienetui', '#57534e'],
    ['Transportas', 'Fiksuota arba pagal valandas', '#334155'],
    ['Nakvynė', 'Kaina vienai nakvynei', '#0e7490'],
    ['Dovanos svečiams ir vaikams', 'Kaina vienam svečiui', '#15803d'],
    ['Vestuvių planuotojas', 'Fiksuota', '#4338ca'],
    ['Medaus mėnuo', 'Fiksuota', '#0891b2'],
    ['Rezervas', '% nuo bendro biudžeto', '#78716c']
  ] loop
    insert into categories (wedding_id, name, calc_hint, color, sort_order)
      values (w, c[1], c[2], c[3], i);
    i := i + 1;
  end loop;

  insert into funding_sources (wedding_id, name, kind) values
    (w, 'Pora', 'couple'), (w, 'Tėvų įnašas', 'parents'), (w, 'Dovanos', 'gifts');
  return w;
end $$;

-- Accept an invitation: the logged-in email must match the invited email
create or replace function accept_invitation(p_token text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv invitations;
begin
  select * into inv from invitations
    where token = p_token and accepted_at is null and expires_at > now();
  if not found then raise exception 'Kvietimas nerastas arba nebegalioja'; end if;
  if lower(inv.email) <> auth_email() then
    raise exception 'Kvietimas skirtas kitam el. pašto adresui';
  end if;
  insert into wedding_members (wedding_id, user_id, email, display_name, role)
    values (inv.wedding_id, auth.user_id(), auth_email(), p_display_name, inv.role)
    on conflict (wedding_id, user_id) do update set role = excluded.role;
  update invitations set accepted_at = now() where id = inv.id;
  return inv.wedding_id;
end $$;

-- GDPR: everything about one wedding as JSON (owner/partner)
create or replace function export_wedding(w uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(w, '{owner,partner}') then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'wedding', (select to_jsonb(x) from weddings x where id = w),
    'members', (select jsonb_agg(x) from wedding_members x where wedding_id = w),
    'categories', (select jsonb_agg(x) from categories x where wedding_id = w),
    'suppliers', (select jsonb_agg(x) from suppliers x where wedding_id = w),
    'expenses', (select jsonb_agg(x) from expenses x where wedding_id = w),
    'private_notes', (select jsonb_agg(x) from expense_private_notes x where wedding_id = w),
    'payments', (select jsonb_agg(x) from payments x where wedding_id = w),
    'funding_sources', (select jsonb_agg(x) from funding_sources x where wedding_id = w),
    'expense_funding', (select jsonb_agg(x) from expense_funding x where wedding_id = w),
    'documents', (select jsonb_agg(x) from documents x where wedding_id = w),
    'comments', (select jsonb_agg(x) from comments x where wedding_id = w),
    'tables', (select jsonb_agg(x) from seating_tables x where wedding_id = w),
    'guests', (select jsonb_agg(x) from guests x where wedding_id = w)
  );
end $$;

-- GDPR: leave every wedding; weddings where the caller is the owner are deleted
create or replace function delete_my_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from weddings where id in (
    select wedding_id from wedding_members where user_id = auth.user_id() and role = 'owner');
  delete from wedding_members where user_id = auth.user_id();
end $$;

-- Audit trigger (F18): stores changed columns only
create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare d jsonb; r record;
begin
  r := coalesce(new, old);
  -- the whole wedding is being deleted: nothing to log against
  if tg_op = 'DELETE' and not exists (select 1 from weddings where id = r.wedding_id) then
    return old;
  end if;
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)) into d
    from jsonb_each(to_jsonb(new) - 'updated_at') n
    join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value;
    if d is null then return new; end if;
  elsif tg_op = 'INSERT' then d := to_jsonb(new);
  else d := to_jsonb(old);
  end if;
  insert into audit_log (wedding_id, table_name, row_id, actor_id, action, diff)
    values (r.wedding_id, tg_table_name, r.id, auth.user_id(), tg_op, d);
  return r;
end $$;

create trigger expenses_audit after insert or update or delete on expenses
  for each row execute function audit_row();
create trigger payments_audit after insert or update or delete on payments
  for each row execute function audit_row();
