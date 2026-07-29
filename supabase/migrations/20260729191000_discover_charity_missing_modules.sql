create table if not exists public.charity_organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  cause text not null default 'General',
  city text not null default '',
  description text not null default '',
  goal_minor numeric(20, 0) not null default 0,
  raised_minor numeric(20, 0) not null default 0,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.charity_donation_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.charity_organizations(id) on delete cascade,
  donor_id uuid not null references public.profiles(id) on delete cascade,
  amount_minor numeric(20, 0) not null check (amount_minor > 0),
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.charity_volunteer_interests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.charity_organizations(id) on delete cascade,
  volunteer_id uuid not null references public.profiles(id) on delete cascade,
  message text not null default '',
  status text not null default 'interested' check (status in ('interested','contacted','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, volunteer_id)
);

create table if not exists public.missing_person_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  person_name text not null,
  age_text text not null default '',
  photo_url text,
  last_seen_city text not null default '',
  last_seen_location text not null default '',
  last_seen_date date,
  description text not null default '',
  reporter_contact text not null default '',
  status text not null default 'missing' check (status in ('missing','found')),
  consent_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.missing_person_tips (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.missing_person_reports(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.charity_organizations enable row level security;
alter table public.charity_donation_intents enable row level security;
alter table public.charity_volunteer_interests enable row level security;
alter table public.missing_person_reports enable row level security;
alter table public.missing_person_tips enable row level security;

drop policy if exists "charity orgs authenticated read" on public.charity_organizations;
create policy "charity orgs authenticated read" on public.charity_organizations
for select to authenticated using (true);

drop policy if exists "charity orgs owner insert" on public.charity_organizations;
create policy "charity orgs owner insert" on public.charity_organizations
for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists "charity orgs owner update" on public.charity_organizations;
create policy "charity orgs owner update" on public.charity_organizations
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "charity donations self read" on public.charity_donation_intents;
create policy "charity donations self read" on public.charity_donation_intents
for select to authenticated
using (
  donor_id = (select auth.uid())
  or exists (
    select 1 from public.charity_organizations o
    where o.id = charity_donation_intents.organization_id
      and o.owner_id = (select auth.uid())
  )
);

drop policy if exists "charity donations self insert" on public.charity_donation_intents;
create policy "charity donations self insert" on public.charity_donation_intents
for insert to authenticated with check (donor_id = (select auth.uid()) and status = 'pending');

drop policy if exists "charity volunteer self read" on public.charity_volunteer_interests;
create policy "charity volunteer self read" on public.charity_volunteer_interests
for select to authenticated
using (
  volunteer_id = (select auth.uid())
  or exists (
    select 1 from public.charity_organizations o
    where o.id = charity_volunteer_interests.organization_id
      and o.owner_id = (select auth.uid())
  )
);

drop policy if exists "charity volunteer self insert" on public.charity_volunteer_interests;
create policy "charity volunteer self insert" on public.charity_volunteer_interests
for insert to authenticated with check (volunteer_id = (select auth.uid()));

drop policy if exists "missing reports authenticated read" on public.missing_person_reports;
create policy "missing reports authenticated read" on public.missing_person_reports
for select to authenticated using (true);

drop policy if exists "missing reports owner insert" on public.missing_person_reports;
create policy "missing reports owner insert" on public.missing_person_reports
for insert to authenticated with check (reporter_id = (select auth.uid()) and consent_confirmed = true);

drop policy if exists "missing reports owner update" on public.missing_person_reports;
create policy "missing reports owner update" on public.missing_person_reports
for update to authenticated
using (reporter_id = (select auth.uid()))
with check (reporter_id = (select auth.uid()));

drop policy if exists "missing tips report participants read" on public.missing_person_tips;
create policy "missing tips report participants read" on public.missing_person_tips
for select to authenticated
using (
  sender_id = (select auth.uid())
  or exists (
    select 1 from public.missing_person_reports r
    where r.id = missing_person_tips.report_id
      and r.reporter_id = (select auth.uid())
  )
);

drop policy if exists "missing tips authenticated insert" on public.missing_person_tips;
create policy "missing tips authenticated insert" on public.missing_person_tips
for insert to authenticated with check (sender_id = (select auth.uid()));

grant select, insert, update on public.charity_organizations to authenticated;
grant select, insert on public.charity_donation_intents to authenticated;
grant select, insert on public.charity_volunteer_interests to authenticated;
grant select, insert, update on public.missing_person_reports to authenticated;
grant select, insert on public.missing_person_tips to authenticated;
