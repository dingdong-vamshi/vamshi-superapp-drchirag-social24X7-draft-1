create or replace function public.create_storefront_team_invitation(
  target_storefront uuid,
  p_full_name text,
  p_work_email text,
  p_login_id text,
  p_customer_tagline text,
  p_job_title text,
  p_employee_id text,
  p_department text,
  p_role_id uuid,
  p_permissions text[] default null
)
returns table (
  membership_id uuid,
  login_id text,
  activation_code text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  normalized_login text := private.normalize_business_login_id(p_login_id);
  normalized_email text := lower(btrim(coalesce(p_work_email, '')));
  created_member uuid;
  code text := upper(encode(gen_random_bytes(6), 'hex'));
  expiration timestamptz := now() + interval '24 hours';
  storefront_name text;
  permission text;
begin
  if viewer is null
    or not private.storefront_team_permission(target_storefront, 'business_team_manage') then
    raise exception 'Team management permission required.' using errcode = '42501';
  end if;
  select storefront.name into storefront_name
  from public.storefronts storefront
  where storefront.id = target_storefront
    and storefront.active
    and storefront.verification_status = 'approved';
  if storefront_name is null then
    raise exception 'A verified active storefront is required.' using errcode = '42501';
  end if;
  if normalized_login !~ '^[a-z0-9][a-z0-9._-]{2,39}$' then
    raise exception 'Login ID must use 3-40 letters, numbers, dots, underscores or hyphens.' using errcode = '22023';
  end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid work email is required.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.storefront_team_roles role
    where role.id = p_role_id
      and role.storefront_id = target_storefront
      and role.archived_at is null
      and role.system_key is distinct from 'owner'
  ) then
    raise exception 'Selected role is unavailable.' using errcode = '22023';
  end if;
  if p_permissions is not null then
    foreach permission in array p_permissions loop
      if not exists (select 1 from public.storefront_team_permissions catalog where catalog.code = permission) then
        raise exception 'Unknown permission: %', permission using errcode = '22023';
      end if;
      if not exists (
        select 1 from public.storefronts storefront
        where storefront.id = target_storefront and storefront.owner_id = viewer
      ) and not private.storefront_team_permission(target_storefront, permission) then
        raise exception 'Cannot grant a permission you do not hold.' using errcode = '42501';
      end if;
    end loop;
  end if;

  insert into public.storefront_team_memberships (
    storefront_id, role_id, full_name, work_email, login_id,
    customer_tagline, job_title, employee_id, department,
    status, identity_kind, invited_by
  ) values (
    target_storefront,
    p_role_id,
    btrim(p_full_name),
    normalized_email,
    normalized_login,
    coalesce(nullif(btrim(p_customer_tagline), ''), 'from ' || storefront_name),
    btrim(p_job_title),
    nullif(btrim(p_employee_id), ''),
    coalesce(nullif(btrim(p_department), ''), 'Customer Support'),
    'not_activated',
    'work',
    viewer
  ) returning id into created_member;

  if p_permissions is not null then
    insert into public.storefront_team_member_permissions (
      membership_id, permission_code, allowed, granted_by
    )
    select created_member, catalog.code, catalog.code = any(p_permissions), viewer
    from public.storefront_team_permissions catalog;
  end if;

  insert into public.storefront_team_invitations (
    membership_id, code_hash, expires_at, created_by
  ) values (
    created_member, encode(digest(code, 'sha256'), 'hex'), expiration, viewer
  );

  insert into public.storefront_team_audit_events (
    storefront_id, membership_id, actor_user_id, event_type, detail
  ) values (
    target_storefront, created_member, viewer, 'invited',
    jsonb_build_object('loginId', normalized_login, 'roleId', p_role_id)
  );

  return query select created_member, normalized_login, code, expiration;
end;
$$;

create or replace function public.update_storefront_team_member_access(
  target_member uuid,
  p_role_id uuid,
  p_customer_tagline text,
  p_job_title text,
  p_department text,
  p_permissions text[] default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  member public.storefront_team_memberships%rowtype;
  existing_role uuid;
  permission text;
begin
  select * into member
  from public.storefront_team_memberships
  where id = target_member
  for update;
  if member.id is null
    or not private.storefront_team_permission(member.storefront_id, 'business_team_manage') then
    raise exception 'Team management permission required.' using errcode = '42501';
  end if;
  if member.identity_kind = 'owner_personal' then
    raise exception 'The root Owner membership cannot be edited.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.storefront_team_roles role
    where role.id = p_role_id
      and role.storefront_id = member.storefront_id
      and role.archived_at is null
      and role.system_key is distinct from 'owner'
  ) then
    raise exception 'Selected role is unavailable.' using errcode = '22023';
  end if;
  if p_permissions is not null then
    foreach permission in array p_permissions loop
      if not exists (
        select 1 from public.storefront_team_permissions catalog
        where catalog.code = permission
      ) then
        raise exception 'Unknown permission: %', permission using errcode = '22023';
      end if;
      if not exists (
        select 1 from public.storefronts storefront
        where storefront.id = member.storefront_id and storefront.owner_id = viewer
      ) and not private.storefront_team_permission(member.storefront_id, permission) then
        raise exception 'Cannot grant a permission you do not hold.' using errcode = '42501';
      end if;
    end loop;
  end if;
  existing_role := member.role_id;
  update public.storefront_team_memberships
  set role_id = p_role_id,
      customer_tagline = coalesce(nullif(btrim(p_customer_tagline), ''), customer_tagline),
      job_title = coalesce(nullif(btrim(p_job_title), ''), job_title),
      department = coalesce(nullif(btrim(p_department), ''), department),
      updated_at = now()
  where id = member.id;
  if p_permissions is not null then
    delete from public.storefront_team_member_permissions
    where membership_id = member.id;
    insert into public.storefront_team_member_permissions (
      membership_id, permission_code, allowed, granted_by
    )
    select member.id, catalog.code, catalog.code = any(p_permissions), viewer
    from public.storefront_team_permissions catalog;
  end if;
  if existing_role is distinct from p_role_id then
    insert into public.storefront_team_audit_events (
      storefront_id, membership_id, actor_user_id, event_type, detail
    ) values (
      member.storefront_id, member.id, viewer, 'role_changed',
      jsonb_build_object('fromRoleId', existing_role, 'toRoleId', p_role_id)
    );
  end if;
  if p_permissions is not null then
    insert into public.storefront_team_audit_events (
      storefront_id, membership_id, actor_user_id, event_type, detail
    ) values (
      member.storefront_id, member.id, viewer, 'permissions_changed',
      jsonb_build_object('permissions', to_jsonb(p_permissions))
    );
  end if;
end;
$$;
