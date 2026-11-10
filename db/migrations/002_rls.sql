-- 002: row-level security. Every wedding is visible only to its members.
--   owner   – everything, including deleting the wedding
--   partner – everything except deleting the wedding
--   editor  – read/write expenses, payments, suppliers, documents, comments; no private notes
--   viewer  – read only (the UI shows summaries and the viewer's own funding source)

create or replace function member_role_of(w uuid) returns member_role
language sql stable security definer set search_path = public as $$
  select role from wedding_members where wedding_id = w and user_id = auth.user_id()
$$;

create or replace function is_member(w uuid, roles member_role[] default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from wedding_members
    where wedding_id = w and user_id = auth.user_id()
      and (roles is null or role = any (roles))
  )
$$;

-- Weddings
alter table weddings enable row level security;
create policy weddings_select on weddings for select using (is_member(id));
create policy weddings_update on weddings for update using (is_member(id, '{owner,partner}'));
create policy weddings_delete on weddings for delete using (is_member(id, '{owner}'));
-- inserts go through create_wedding_with_defaults()

-- Members & invitations: everyone sees co-members; owner/partner manage
alter table wedding_members enable row level security;
create policy members_select on wedding_members for select using (is_member(wedding_id));
create policy members_write on wedding_members for update using (is_member(wedding_id, '{owner,partner}'));
create policy members_delete on wedding_members for delete
  using (is_member(wedding_id, '{owner,partner}') and role <> 'owner');

alter table invitations enable row level security;
create policy invitations_all on invitations for all
  using (is_member(wedding_id, '{owner,partner}')) with check (is_member(wedding_id, '{owner,partner}'));

-- Planning tables only owner/partner change; all members read
do $$
declare t text;
begin
  foreach t in array array['categories','funding_sources','expense_funding','seating_tables','guests'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_select on %I for select using (is_member(wedding_id))', t, t);
    execute format('create policy %I_write on %I for all using (is_member(wedding_id, ''{owner,partner}'')) with check (is_member(wedding_id, ''{owner,partner}''))', t, t);
  end loop;
  -- Tables editors may also write
  foreach t in array array['suppliers','payments','documents','comments'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_select on %I for select using (is_member(wedding_id))', t, t);
    execute format('create policy %I_write on %I for all using (is_member(wedding_id, ''{owner,partner,editor}'')) with check (is_member(wedding_id, ''{owner,partner,editor}''))', t, t);
  end loop;
end $$;

-- Expenses: every member reads, owner/partner/editor write
alter table expenses enable row level security;
create policy expenses_select on expenses for select using (is_member(wedding_id));
create policy expenses_write on expenses for all
  using (is_member(wedding_id, '{owner,partner,editor}'))
  with check (is_member(wedding_id, '{owner,partner,editor}'));

-- Private notes: only the couple
alter table expense_private_notes enable row level security;
create policy private_notes_couple on expense_private_notes for all
  using (is_member(wedding_id, '{owner,partner}'))
  with check (is_member(wedding_id, '{owner,partner}'));

-- History: read-only for members, written by triggers
alter table audit_log enable row level security;
create policy audit_select on audit_log for select using (is_member(wedding_id, '{owner,partner,editor}'));
