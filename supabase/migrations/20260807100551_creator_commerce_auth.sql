create schema if not exists private;

create type public.commerce_approval_status as enum (
  'not_applied',
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'more_information_required',
  'suspended'
);

create type public.buyer_kyc_status as enum (
  'not_submitted',
  'submitted',
  'under_review',
  'verified',
  'rejected',
  'more_information_required',
  'suspended'
);

create table public.creator_commerce_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seller_status public.commerce_approval_status not null default 'not_applied',
  creator_status public.commerce_approval_status not null default 'not_applied',
  professional_status public.commerce_approval_status not null default 'not_applied',
  buyer_kyc_status public.buyer_kyc_status not null default 'not_submitted',
  admin_access boolean not null default false,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.creator_commerce_access is
  'Server-owned commerce capabilities. Approval fields must never be derived from user-editable auth metadata.';

insert into public.creator_commerce_access (user_id)
select users.id
from auth.users as users
on conflict (user_id) do nothing;

create or replace function private.create_creator_commerce_access_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.creator_commerce_access (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.create_creator_commerce_access_for_user() from public;

create trigger create_creator_commerce_access_after_signup
after insert on auth.users
for each row execute function private.create_creator_commerce_access_for_user();

create or replace function private.is_creator_commerce_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'commerce_admin',
    false
  ) or coalesce(
    (select auth.jwt() -> 'app_metadata' -> 'roles') ? 'commerce_admin',
    false
  );
$$;

revoke all on function private.is_creator_commerce_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_creator_commerce_admin() to authenticated;

alter table public.creator_commerce_access enable row level security;

create policy "commerce users read own access"
on public.creator_commerce_access
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "commerce admins read access"
on public.creator_commerce_access
for select
to authenticated
using ((select private.is_creator_commerce_admin()));

create policy "commerce admins insert access"
on public.creator_commerce_access
for insert
to authenticated
with check ((select private.is_creator_commerce_admin()));

create policy "commerce admins update access"
on public.creator_commerce_access
for update
to authenticated
using ((select private.is_creator_commerce_admin()))
with check ((select private.is_creator_commerce_admin()));

grant select on public.creator_commerce_access to authenticated;
grant insert, update on public.creator_commerce_access to authenticated;

create or replace function public.get_my_creator_commerce_access()
returns public.creator_commerce_access
language sql
stable
security invoker
set search_path = ''
as $$
  select access
  from public.creator_commerce_access as access
  where access.user_id = (select auth.uid());
$$;

revoke all on function public.get_my_creator_commerce_access() from public;
grant execute on function public.get_my_creator_commerce_access() to authenticated;
