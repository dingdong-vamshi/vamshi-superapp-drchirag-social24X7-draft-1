-- Keep login-phone verification private and separate from Supabase Phone Auth.
-- The temporary shared legacy value cannot be stored in auth.users.phone because
-- GoTrue correctly requires that identity to be unique.
create table if not exists private.account_phone_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone_e164 text not null,
  is_legacy_shared boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint account_phone_credentials_phone_format
    check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

create unique index if not exists account_phone_credentials_unique_current_phone
  on private.account_phone_credentials(phone_e164)
  where is_legacy_shared = false;

alter table private.account_phone_credentials enable row level security;
revoke all on table private.account_phone_credentials from public, anon, authenticated;

create or replace function private.normalize_login_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if length(digits) = 10 then
    digits := '91' || digits;
  end if;
  if digits !~ '^[1-9][0-9]{7,14}$' then
    return null;
  end if;
  return '+' || digits;
end;
$$;

revoke all on function private.normalize_login_phone(text) from public;

-- Every account that exists when this migration is applied is a legacy account.
-- They intentionally share the client-approved temporary confirmation value.
insert into private.account_phone_credentials(user_id, phone_e164, is_legacy_shared)
select id, '+919000000000', true
from auth.users
on conflict (user_id) do nothing;

create or replace function public.verify_my_login_phone(p_phone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.account_phone_credentials credential
    where credential.user_id = auth.uid()
      and credential.phone_e164 = private.normalize_login_phone(p_phone)
  );
$$;

revoke all on function public.verify_my_login_phone(text) from public, anon;
grant execute on function public.verify_my_login_phone(text) to authenticated;

create or replace function public.get_my_login_phone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select credential.phone_e164
  from private.account_phone_credentials credential
  where credential.user_id = auth.uid();
$$;

revoke all on function public.get_my_login_phone() from public, anon;
grant execute on function public.get_my_login_phone() to authenticated;

create or replace function public.update_my_login_phone(p_phone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized text := private.normalize_login_phone(p_phone);
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if normalized is null then
    raise exception 'Enter a valid phone number';
  end if;

  insert into private.account_phone_credentials(user_id, phone_e164, is_legacy_shared, updated_at)
  values (current_user_id, normalized, false, now())
  on conflict (user_id) do update set
    phone_e164 = excluded.phone_e164,
    is_legacy_shared = false,
    updated_at = now();

  update public.profiles
  set phone = null,
      phone_discoverable = false,
      updated_at = now()
  where id = current_user_id;

  return normalized;
exception
  when unique_violation then
    raise exception 'Unable to use this phone number';
end;
$$;

revoke all on function public.update_my_login_phone(text) from public, anon;
grant execute on function public.update_my_login_phone(text) to authenticated;

-- New email accounts must supply a normalized phone in signup metadata. The
-- value is copied once into a private, server-owned credential row. It is never
-- read from mutable user metadata during authorization.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'auth', 'private'
as $$
declare
  base_username text;
  candidate_username text;
  normalized_phone text;
  suffix integer := 0;
begin
  normalized_phone := private.normalize_login_phone(
    coalesce(nullif(new.phone, ''), new.raw_user_meta_data ->> 'phone_e164')
  );
  if normalized_phone is null then
    raise exception 'A valid phone number is required';
  end if;

  base_username := private.clean_profile_username(
    coalesce(
      new.raw_user_meta_data ->> 'preferred_username',
      new.raw_user_meta_data ->> 'username',
      split_part(new.email, '@', 1),
      right(normalized_phone, 10)
    ),
    new.id
  );
  candidate_username := base_username;

  while exists(select 1 from public.profiles where username = candidate_username and id <> new.id) loop
    suffix := suffix + 1;
    candidate_username := left(base_username, greatest(3, 30 - length(suffix::text) - 1)) || '_' || suffix::text;
  end loop;

  insert into public.profiles (
    id, username, display_name, phone, is_private, username_discoverable, phone_discoverable
  ) values (
    new.id,
    candidate_username,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), candidate_username), 80),
    null,
    false,
    true,
    false
  )
  on conflict (id) do update set
    username = excluded.username,
    display_name = excluded.display_name,
    phone = null,
    phone_discoverable = false,
    updated_at = now();

  insert into private.account_phone_credentials(user_id, phone_e164, is_legacy_shared)
  values (new.id, normalized_phone, false)
  on conflict (user_id) do update set
    phone_e164 = excluded.phone_e164,
    is_legacy_shared = false,
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public;

-- Existing public profile phone data is no longer authoritative login data.
update public.profiles
set phone = null,
    phone_discoverable = false,
    updated_at = now()
where phone is not null or phone_discoverable = true;
