-- GoTrue creates the auth.users row before it applies admin-supplied app
-- metadata. Authorize that narrow insert window with the server-issued,
-- short-lived activation claim instead of user-editable metadata.
create or replace function private.is_claimed_business_work_identity(
  candidate_email text,
  candidate_app_metadata jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(candidate_app_metadata ->> 'account_type', '') = 'business_employee'
    or exists (
      select 1
      from public.storefront_team_memberships membership
      join public.storefront_team_invitations invitation
        on invitation.membership_id = membership.id
      where membership.identity_kind = 'work'
        and membership.status = 'not_activated'
        and membership.auth_user_id is null
        and lower(coalesce(candidate_email, '')) = membership.login_id || '@work.social24x7.app'
        and invitation.consumed_at is null
        and invitation.revoked_at is null
        and invitation.expires_at > now()
        and invitation.activation_claim_hash is not null
        and invitation.activation_claim_expires_at > now()
    );
$$;

revoke all on function private.is_claimed_business_work_identity(text, jsonb) from public;

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
  if private.is_claimed_business_work_identity(new.email, new.raw_app_meta_data) then
    return new;
  end if;
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

create or replace function private.create_creator_commerce_access_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_claimed_business_work_identity(new.email, new.raw_app_meta_data) then
    return new;
  end if;
  insert into public.creator_commerce_access (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
