-- 001: core schema. All money columns are integer cents (bigint).
-- User ids are text: they come from the Neon Auth JWT via auth.user_id().


create type member_role as enum ('owner', 'partner', 'editor', 'viewer');
create type expense_status as enum ('idea', 'offer', 'contract', 'partly_paid', 'paid', 'cancelled');
create type calc_type as enum ('fixed', 'per_guest', 'hourly', 'per_unit', 'per_table');
create type limit_type as enum ('amount', 'percent');
create type payment_kind as enum ('deposit', 'interim', 'final');
create type payment_method as enum ('cash', 'transfer', 'card');
create type contract_status as enum ('none', 'negotiating', 'signed', 'cancelled');

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create table weddings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  wedding_date date,
  venue text,
  guest_count int not null default 0 check (guest_count >= 0),
  use_guest_list boolean not null default false,
  total_budget_cents bigint not null default 0 check (total_budget_cents >= 0),
  reserve_pct numeric(5,2) not null default 10 check (reserve_pct between 0 and 100),
  currency text not null default 'EUR',
  created_by text not null default auth.user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table funding_sources (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references weddings on delete cascade,
  name text not null,
  kind text not null default 'other', -- couple | parents | gifts | other
  pledged_cents bigint not null default 0,
  received_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table wedding_members (
  wedding_id uuid not null references weddings on delete cascade,
  user_id text not null,
  email text not null,
  display_name text,
  role member_role not null,
  funding_source_id uuid references funding_sources on delete set null,
  created_at timestamptz not null default now(),
  primary key (wedding_id, user_id)
);
create index on wedding_members (user_id);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references weddings on delete cascade,
  email text not null,
  role member_role not null check (role <> 'owner'),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  invited_by text not null default auth.user_id(),
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references weddings on delete cascade,
  name text not null,
  limit_type limit_type,
  limit_value bigint, -- cents for amount, percent for percent
  color text not null default '#a8a29e',
  sort_order int not null default 0,
  calc_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references weddings on delete cascade,
  name text not null,
  contact_person text,
  phone text,
  email text,
  website text,
  contract_status contract_status not null default 'none',
  rating smallint check (rating between 1 and 5),
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references weddings on delete cascade,
  category_id uuid not null references categories on delete restrict,
  supplier_id uuid references suppliers on delete set null,
  title text not null,
  status expense_status not null default 'idea',
  calc_type calc_type not null default 'fixed',
  unit_price_cents bigint,
  quantity numeric(10,2),
  fixed_part_cents bigint,
  planned_cents bigint,
  contracted_cents bigint,
  vat_pct numeric(5,2),
  service_fee_cents bigint,
  notes text,
  deleted_at timestamptz,
  created_by text not null default auth.user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on expenses (wedding_id);

-- Personal notes of the couple, kept apart so RLS can hide them from editors/viewers
create table expense_private_notes (
  expense_id uuid primary key references expenses on delete cascade,
  wedding_id uuid not null references weddings on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references weddings on delete cascade,
  expense_id uuid not null references expenses on delete cascade,
  kind payment_kind not null default 'deposit',
  amount_cents bigint not null check (amount_cents >= 0),
  due_date date,
  paid_date date,
  is_paid boolean not null default false,
  method payment_method,
  paid_by_source_id uuid references funding_sources on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on payments (wedding_id, due_date);

create table expense_funding (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references weddings on delete cascade,
  expense_id uuid not null references expenses on delete cascade,
  funding_source_id uuid not null references funding_sources on delete cascade,
  share_pct numeric(5,2) check (share_pct between 0 and 100),
  amount_cents bigint,
  check ((share_pct is null) <> (amount_cents is null))
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references weddings on delete cascade,
  expense_id uuid references expenses on delete cascade,
  supplier_id uuid references suppliers on delete cascade,
  storage_key text not null,
  file_name text not null,
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes int not null check (size_bytes <= 10485760),
  uploaded_by text not null default auth.user_id(),
  created_at timestamptz not null default now(),
  check (expense_id is not null or supplier_id is not null)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references weddings on delete cascade,
  expense_id uuid not null references expenses on delete cascade,
  author_id text not null default auth.user_id(),
  body text not null,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  wedding_id uuid not null references weddings on delete cascade,
  table_name text not null,
  row_id uuid not null,
  actor_id text,
  action text not null, -- INSERT | UPDATE | DELETE
  diff jsonb,
  created_at timestamptz not null default now()
);
create index on audit_log (wedding_id, row_id);

create table seating_tables (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references weddings on delete cascade,
  name text not null,
  seats int not null default 8 check (seats > 0),
  cost_cents bigint not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table guests (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references weddings on delete cascade,
  name text not null,
  attending boolean, -- null = unknown
  is_child boolean not null default false,
  needs_lodging boolean not null default false,
  table_id uuid references seating_tables on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['weddings','funding_sources','categories','suppliers','expenses','payments','seating_tables','guests'] loop
    execute format('create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;
