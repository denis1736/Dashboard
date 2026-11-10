-- Aureum: Schema für den späteren Sync über Supabase (Postgres, Region EU).
--
-- Stand: Entwurf. Die Anwendung arbeitet derzeit local-first (IndexedDB) und
-- nutzt dieses Schema noch nicht; es wurde nicht gegen eine laufende Datenbank
-- ausgeführt. Es bildet das Domänenmodell aus src/lib/types.ts ab und legt die
-- Zugriffsregeln fest, damit der Wechsel ohne Umbau des Modells möglich ist.
--
-- Mandantenmodell: Jeder Datensatz gehört zu einem Bestand (portfolio). Zugriff
-- hat, wer Mitglied des Bestands ist; die Rolle steuert Schreibrechte.
--   inhaber     alles, inklusive Mitgliederverwaltung und Löschen
--   bearbeiter  lesen und schreiben
--   leser       nur lesen (z. B. Steuerberater, Bank)

create extension if not exists pgcrypto;

create type member_role as enum ('inhaber', 'bearbeiter', 'leser');

create table portfolios (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  tax_rate_pct numeric(5,2) not null default 42,
  index_overrides jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table portfolio_members (
  portfolio_id uuid not null references portfolios on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role member_role not null default 'leser',
  primary key (portfolio_id, user_id)
);

create table properties (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios on delete cascade,
  name text not null,
  street text not null default '',
  zip text not null default '',
  city text not null default '',
  type text not null check (type in ('ETW','MFH','EFH','WGH','GEW','STP')),
  year_built int not null,
  purchase_date date not null,
  notary_date date not null,
  purchase_price numeric(14,2) not null,
  closing_costs jsonb not null default '{"grunderwerbsteuer":0,"notar":0,"makler":0,"sonstige":0}',
  initial_capex numeric(14,2) not null default 0,
  land_share_pct numeric(5,2) not null default 25,
  afa_method text not null default 'linear' check (afa_method in ('linear','degressiv','individuell')),
  afa_rate_pct numeric(5,2) not null default 2,
  valuation jsonb not null default '{"mode":"index"}',
  costs jsonb not null default '{"verwaltung":0,"instandhaltung":0,"sonstige":0,"umlagefaehig":0}',
  notes text,
  updated_at timestamptz not null default now()
);

create table units (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios on delete cascade,
  property_id uuid not null references properties on delete cascade,
  name text not null,
  area numeric(8,2) not null default 0,
  rooms numeric(4,1) not null default 0,
  status text not null default 'leer' check (status in ('vermietet','leer','vermarktung','sanierung','eigennutzung')),
  market_rent numeric(10,2) not null default 0,
  vacant_since date,
  updated_at timestamptz not null default now()
);

create table leases (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios on delete cascade,
  unit_id uuid not null references units on delete cascade,
  tenant_name text not null,
  tenant_email text,
  tenant_phone text,
  start_date date not null,
  end_date date,
  cold_rent numeric(10,2) not null,
  prepayment numeric(10,2) not null default 0,
  deposit numeric(10,2) not null default 0,
  rent_type text not null default 'standard' check (rent_type in ('standard','staffel','index')),
  steps jsonb not null default '[]',
  last_increase date,
  updated_at timestamptz not null default now()
);

create table loans (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios on delete cascade,
  property_id uuid not null references properties on delete cascade,
  lender text not null,
  label text not null default '',
  type text not null check (type in ('annuitaet','endfaellig','variabel')),
  principal numeric(14,2) not null,
  start_date date not null,
  interest_pct numeric(6,3) not null,
  repayment_pct numeric(6,3) not null default 0,
  monthly_payment numeric(12,2),
  fixed_until date not null,
  follow_up_pct numeric(6,3),
  special_repayments jsonb not null default '[]',
  rate_changes jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios on delete cascade,
  property_id uuid not null references properties on delete cascade,
  date date not null,
  category text not null,
  amount numeric(12,2) not null,
  deductible boolean not null default true,
  note text not null default '',
  updated_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios on delete cascade,
  lease_id uuid not null references leases on delete cascade,
  month char(7) not null,
  amount numeric(10,2) not null,
  paid_at date not null
);

create table reminders (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios on delete cascade,
  property_id uuid references properties on delete cascade,
  title text not null,
  date date not null,
  kind text not null,
  repeat_months int not null default 0,
  done boolean not null default false,
  note text
);

create index on properties (portfolio_id);
create index on units (property_id);
create index on leases (unit_id);
create index on loans (property_id);
create index on expenses (property_id, date);
create index on payments (lease_id, month);
create index on reminders (portfolio_id, date);

-- Zugriff -------------------------------------------------------------------

create or replace function member_role_of(p uuid) returns member_role
language sql stable security definer set search_path = public as $$
  select role from portfolio_members where portfolio_id = p and user_id = auth.uid()
$$;

alter table portfolios enable row level security;
alter table portfolio_members enable row level security;

create policy portfolios_read on portfolios for select using (member_role_of(id) is not null);
create policy portfolios_write on portfolios for update using (member_role_of(id) = 'inhaber');
create policy portfolios_delete on portfolios for delete using (member_role_of(id) = 'inhaber');
-- Anlegen über eine RPC, die Bestand und Inhaber-Mitgliedschaft in einer Transaktion schreibt.

create policy members_read on portfolio_members for select using (member_role_of(portfolio_id) is not null);
create policy members_manage on portfolio_members for all
  using (member_role_of(portfolio_id) = 'inhaber') with check (member_role_of(portfolio_id) = 'inhaber');

do $$
declare t text;
begin
  foreach t in array array['properties','units','leases','loans','expenses','payments','reminders'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (member_role_of(portfolio_id) is not null)', t || '_read', t);
    execute format(
      'create policy %I on %I for all using (member_role_of(portfolio_id) in (''inhaber'',''bearbeiter'')) with check (member_role_of(portfolio_id) in (''inhaber'',''bearbeiter''))',
      t || '_write', t);
  end loop;
end $$;
