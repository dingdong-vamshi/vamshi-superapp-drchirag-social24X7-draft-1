-- Tenant-scoped permissions, lifecycle RPCs and separate work-auth support.

create or replace function private.is_business_work_identity()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'account_type', '') = 'business_employee';
$$;

create or replace function private.normalize_business_login_id(value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select lower(regexp_replace(btrim(coalesce(value, '')), '[^a-zA-Z0-9._-]+', '', 'g'));
$$;

create or replace function private.storefront_team_member_id(target_storefront uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select member.id
  from public.storefront_team_memberships member
  where member.storefront_id = target_storefront
    and member.auth_user_id = auth.uid()
    and member.status = 'verified'
  limit 1;
$$;

create or replace function private.storefront_team_permission(
  target_storefront uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.storefronts storefront
    where storefront.id = target_storefront
      and storefront.owner_id = auth.uid()
  ) or exists (
    select 1
    from public.storefront_team_memberships member
    where member.storefront_id = target_storefront
      and member.auth_user_id = auth.uid()
      and member.status = 'verified'
      and coalesce(
        (
          select override.allowed
          from public.storefront_team_member_permissions override
          where override.membership_id = member.id
            and override.permission_code = target_permission
        ),
        exists (
          select 1
          from public.storefront_team_role_permissions role_permission
          where role_permission.role_id = member.role_id
            and role_permission.permission_code = target_permission
        ),
        false
      )
  );
$$;

create or replace function private.storefront_team_member_permission(
  target_member uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.storefront_team_memberships member
    where member.id = target_member
      and member.status = 'verified'
      and coalesce(
        (
          select override.allowed
          from public.storefront_team_member_permissions override
          where override.membership_id = member.id
            and override.permission_code = target_permission
        ),
        exists (
          select 1
          from public.storefront_team_role_permissions role_permission
          where role_permission.role_id = member.role_id
            and role_permission.permission_code = target_permission
        ),
        false
      )
  );
$$;

create or replace function private.effective_storefront_team_permissions(target_member uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select permission.code
  from public.storefront_team_permissions permission
  join public.storefront_team_memberships member on member.id = target_member
  where coalesce(
    (
      select override.allowed
      from public.storefront_team_member_permissions override
      where override.membership_id = member.id
        and override.permission_code = permission.code
    ),
    exists (
      select 1
      from public.storefront_team_role_permissions role_permission
      where role_permission.role_id = member.role_id
        and role_permission.permission_code = permission.code
    ),
    false
  )
  order by permission.code;
$$;

revoke all on function private.is_business_work_identity() from public;
revoke all on function private.normalize_business_login_id(text) from public;
revoke all on function private.storefront_team_member_id(uuid) from public;
revoke all on function private.storefront_team_permission(uuid, text) from public;
revoke all on function private.storefront_team_member_permission(uuid, text) from public;
revoke all on function private.effective_storefront_team_permissions(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_business_work_identity() to authenticated;
grant execute on function private.storefront_team_member_id(uuid) to authenticated;
grant execute on function private.storefront_team_permission(uuid, text) to authenticated;

create policy storefront_team_permission_catalog_read
on public.storefront_team_permissions for select to authenticated
using (true);

create policy storefront_team_roles_authorized_read
on public.storefront_team_roles for select to authenticated
using (
  private.storefront_team_permission(storefront_id, 'business_team_manage')
  or private.storefront_team_member_id(storefront_id) is not null
);

create policy storefront_team_role_permissions_authorized_read
on public.storefront_team_role_permissions for select to authenticated
using (
  exists (
    select 1
    from public.storefront_team_roles role
    where role.id = role_id
      and (
        private.storefront_team_permission(role.storefront_id, 'business_team_manage')
        or private.storefront_team_member_id(role.storefront_id) is not null
      )
  )
);

create policy storefront_team_memberships_authorized_read
on public.storefront_team_memberships for select to authenticated
using (
  auth_user_id = auth.uid()
  or private.storefront_team_permission(storefront_id, 'business_team_manage')
  or private.storefront_team_permission(storefront_id, 'business_chat_monitor')
);

create policy storefront_team_member_permissions_authorized_read
on public.storefront_team_member_permissions for select to authenticated
using (
  exists (
    select 1
    from public.storefront_team_memberships member
    where member.id = membership_id
      and (
        member.auth_user_id = auth.uid()
        or private.storefront_team_permission(member.storefront_id, 'business_team_manage')
      )
  )
);

create policy storefront_team_audit_authorized_read
on public.storefront_team_audit_events for select to authenticated
using (
  private.storefront_team_permission(storefront_id, 'business_team_manage')
  or private.storefront_team_permission(storefront_id, 'business_chat_monitor')
);

create or replace function public.get_my_business_work_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  result jsonb;
begin
  if viewer is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'membershipId', member.id,
    'storefrontId', member.storefront_id,
    'storefrontName', storefront.name,
    'storefrontSlug', storefront.slug,
    'storefrontVerified', storefront.active and storefront.verification_status = 'approved',
    'fullName', coalesce(member.verified_display_name, member.full_name),
    'customerTagline', member.customer_tagline,
    'jobTitle', member.job_title,
    'department', member.department,
    'roleId', role.id,
    'roleName', role.name,
    'status', member.status,
    'representativeVerified', (
      member.status = 'verified'
      and storefront.active
      and storefront.verification_status = 'approved'
    ),
    'permissions', coalesce((
      select jsonb_agg(permission order by permission)
      from private.effective_storefront_team_permissions(member.id) permission
    ), '[]'::jsonb)
  )
  into result
  from public.storefront_team_memberships member
  join public.storefronts storefront on storefront.id = member.storefront_id
  join public.storefront_team_roles role on role.id = member.role_id
  where member.auth_user_id = viewer
    and member.identity_kind = 'work'
  limit 1;

  return result;
end;
$$;

create or replace function public.get_storefront_team_dashboard(target_storefront uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null
    or not private.storefront_team_permission(target_storefront, 'business_team_manage') then
    raise exception 'Team management permission required.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'storefront', jsonb_build_object(
      'id', storefront.id,
      'name', storefront.name,
      'slug', storefront.slug,
      'verified', storefront.active and storefront.verification_status = 'approved',
      'verificationStatus', storefront.verification_status,
      'logoPath', storefront.logo_path
    ),
    'counts', jsonb_build_object(
      'verified', count(*) filter (where member.status = 'verified'),
      'awaitingApproval', count(*) filter (where member.status = 'awaiting_approval'),
      'notActivated', count(*) filter (where member.status = 'not_activated'),
      'suspended', count(*) filter (where member.status = 'suspended'),
      'removed', count(*) filter (where member.status = 'removed')
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', listed.id,
        'fullName', coalesce(listed.verified_display_name, listed.full_name),
        'approvedDisplayName', listed.full_name,
        'workEmail', listed.work_email,
        'loginId', listed.login_id,
        'customerTagline', listed.customer_tagline,
        'jobTitle', listed.job_title,
        'employeeId', listed.employee_id,
        'department', listed.department,
        'roleId', listed.role_id,
        'roleName', listed.role_name,
        'roleKey', listed.system_key,
        'status', listed.status,
        'identityKind', listed.identity_kind,
        'representativeVerified', listed.status = 'verified'
          and storefront.active
          and storefront.verification_status = 'approved',
        'permissions', coalesce((
          select jsonb_agg(permission order by permission)
          from private.effective_storefront_team_permissions(listed.id) permission
        ), '[]'::jsonb),
        'createdAt', listed.created_at,
        'activatedAt', listed.activated_at,
        'approvedAt', listed.approved_at
      ) order by
        case listed.status
          when 'awaiting_approval' then 0
          when 'not_activated' then 1
          when 'verified' then 2
          when 'suspended' then 3
          else 4
        end,
        lower(listed.full_name)
      )
      from (
        select member.*, role.name as role_name, role.system_key
        from public.storefront_team_memberships member
        join public.storefront_team_roles role on role.id = member.role_id
        where member.storefront_id = target_storefront
      ) listed
    ), '[]'::jsonb),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', role.id,
        'name', role.name,
        'systemKey', role.system_key,
        'description', role.description,
        'isSystem', role.is_system,
        'archivedAt', role.archived_at,
        'usageCount', (select count(*) from public.storefront_team_memberships member where member.role_id = role.id and member.status <> 'removed'),
        'permissions', coalesce((
          select jsonb_agg(role_permission.permission_code order by role_permission.permission_code)
          from public.storefront_team_role_permissions role_permission
          where role_permission.role_id = role.id
        ), '[]'::jsonb)
      ) order by role.is_system desc, lower(role.name))
      from public.storefront_team_roles role
      where role.storefront_id = target_storefront
        and role.archived_at is null
    ), '[]'::jsonb),
    'permissionCatalog', (
      select jsonb_agg(jsonb_build_object(
        'code', permission.code,
        'label', permission.label,
        'description', permission.description
      ) order by permission.label)
      from public.storefront_team_permissions permission
    ),
    'auditEvents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', audit.id,
        'membershipId', audit.membership_id,
        'eventType', audit.event_type,
        'detail', audit.detail,
        'createdAt', audit.created_at
      ) order by audit.created_at desc)
      from (
        select *
        from public.storefront_team_audit_events event
        where event.storefront_id = target_storefront
        order by event.created_at desc
        limit 80
      ) audit
    ), '[]'::jsonb)
  )
  into result
  from public.storefronts storefront
  left join public.storefront_team_memberships member on member.storefront_id = storefront.id
  where storefront.id = target_storefront
  group by storefront.id;

  return result;
end;
$$;

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
      and role.system_key <> 'owner'
  ) then
    raise exception 'Selected role is unavailable.' using errcode = '22023';
  end if;
  if p_permissions is not null then
    foreach permission in array p_permissions loop
      if not exists (select 1 from public.storefront_team_permissions catalog where catalog.code = permission) then
        raise exception 'Unknown permission: %', permission using errcode = '22023';
      end if;
      if not exists (select 1 from public.storefronts storefront where storefront.id = target_storefront and storefront.owner_id = viewer)
        and not private.storefront_team_permission(target_storefront, permission) then
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

create or replace function public.resend_storefront_team_activation(target_member uuid)
returns table (activation_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  member public.storefront_team_memberships%rowtype;
  code text := upper(encode(gen_random_bytes(6), 'hex'));
  expiration timestamptz := now() + interval '24 hours';
begin
  select * into member from public.storefront_team_memberships where id = target_member for update;
  if member.id is null
    or not private.storefront_team_permission(member.storefront_id, 'business_team_manage') then
    raise exception 'Team management permission required.' using errcode = '42501';
  end if;
  if member.status <> 'not_activated' then
    raise exception 'Only a not-activated member can receive a new code.' using errcode = '22023';
  end if;
  update public.storefront_team_invitations
  set code_hash = encode(digest(code, 'sha256'), 'hex'),
      expires_at = expiration,
      attempts = 0,
      last_attempt_at = null,
      activation_claim_hash = null,
      activation_claim_expires_at = null,
      consumed_at = null,
      revoked_at = null,
      updated_at = now()
  where membership_id = target_member;
  insert into public.storefront_team_audit_events (
    storefront_id, membership_id, actor_user_id, event_type
  ) values (member.storefront_id, member.id, viewer, 'activation_resent');
  return query select code, expiration;
end;
$$;

create or replace function public.approve_storefront_team_member(target_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  member public.storefront_team_memberships%rowtype;
begin
  select * into member from public.storefront_team_memberships where id = target_member for update;
  if member.id is null
    or not private.storefront_team_permission(member.storefront_id, 'business_team_manage') then
    raise exception 'Team management permission required.' using errcode = '42501';
  end if;
  if member.status <> 'awaiting_approval' or member.auth_user_id is null then
    raise exception 'Member must activate before approval.' using errcode = '22023';
  end if;
  update public.storefront_team_memberships
  set status = 'verified', approved_by = viewer, approved_at = now(),
      suspended_at = null, removed_at = null, updated_at = now()
  where id = member.id;
  insert into public.storefront_team_audit_events (
    storefront_id, membership_id, actor_user_id, event_type
  ) values (member.storefront_id, member.id, viewer, 'approved');
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
  select * into member from public.storefront_team_memberships where id = target_member for update;
  if member.id is null
    or not private.storefront_team_permission(member.storefront_id, 'business_team_manage') then
    raise exception 'Team management permission required.' using errcode = '42501';
  end if;
  if member.identity_kind = 'owner_personal' then
    raise exception 'The root Owner membership cannot be edited.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.storefront_team_roles role
    where role.id = p_role_id and role.storefront_id = member.storefront_id
      and role.archived_at is null and role.system_key <> 'owner'
  ) then
    raise exception 'Selected role is unavailable.' using errcode = '22023';
  end if;
  if p_permissions is not null then
    foreach permission in array p_permissions loop
      if not exists (select 1 from public.storefront_team_permissions catalog where catalog.code = permission) then
        raise exception 'Unknown permission: %', permission using errcode = '22023';
      end if;
      if not exists (select 1 from public.storefronts storefront where storefront.id = member.storefront_id and storefront.owner_id = viewer)
        and not private.storefront_team_permission(member.storefront_id, permission) then
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
    delete from public.storefront_team_member_permissions where membership_id = member.id;
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

create or replace function public.transition_storefront_team_member(
  target_member uuid,
  target_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  member public.storefront_team_memberships%rowtype;
  next_status public.storefront_team_member_status;
  audit_type text;
begin
  select * into member from public.storefront_team_memberships where id = target_member for update;
  if member.id is null
    or not private.storefront_team_permission(member.storefront_id, 'business_team_manage') then
    raise exception 'Team management permission required.' using errcode = '42501';
  end if;
  if member.identity_kind = 'owner_personal' then
    raise exception 'The root Owner membership cannot be suspended or removed.' using errcode = '42501';
  end if;
  if target_action = 'suspend' and member.status in ('verified', 'awaiting_approval') then
    next_status := 'suspended'; audit_type := 'suspended';
  elsif target_action = 'remove' and member.status <> 'removed' then
    next_status := 'removed'; audit_type := 'removed';
  elsif target_action = 'reactivate' and member.status = 'suspended' and member.auth_user_id is not null then
    next_status := 'verified'; audit_type := 'reactivated';
  else
    raise exception 'Invalid member state transition.' using errcode = '22023';
  end if;
  update public.storefront_team_memberships
  set status = next_status,
      suspended_at = case when next_status = 'suspended' then now() else null end,
      removed_at = case when next_status = 'removed' then now() else null end,
      updated_at = now()
  where id = member.id;
  insert into public.storefront_team_audit_events (
    storefront_id, membership_id, actor_user_id, event_type
  ) values (member.storefront_id, member.id, viewer, audit_type);
end;
$$;

create or replace function public.create_storefront_team_role(
  target_storefront uuid,
  p_name text,
  p_description text,
  p_permissions text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  role_id uuid;
  permission text;
begin
  if viewer is null
    or not private.storefront_team_permission(target_storefront, 'business_team_manage') then
    raise exception 'Team management permission required.' using errcode = '42501';
  end if;
  foreach permission in array coalesce(p_permissions, array[]::text[]) loop
    if not exists (select 1 from public.storefront_team_permissions catalog where catalog.code = permission) then
      raise exception 'Unknown permission: %', permission using errcode = '22023';
    end if;
    if not exists (select 1 from public.storefronts storefront where storefront.id = target_storefront and storefront.owner_id = viewer)
      and not private.storefront_team_permission(target_storefront, permission) then
      raise exception 'Cannot grant a permission you do not hold.' using errcode = '42501';
    end if;
  end loop;
  insert into public.storefront_team_roles (
    storefront_id, name, description, is_system, created_by
  ) values (
    target_storefront, btrim(p_name), coalesce(btrim(p_description), ''), false, viewer
  ) returning id into role_id;
  insert into public.storefront_team_role_permissions (role_id, permission_code)
  select role_id, permission
  from unnest(coalesce(p_permissions, array[]::text[])) permission;
  insert into public.storefront_team_audit_events (
    storefront_id, actor_user_id, event_type, detail
  ) values (
    target_storefront, viewer, 'role_created', jsonb_build_object('roleId', role_id, 'name', btrim(p_name))
  );
  return role_id;
end;
$$;

-- Service-role-only two-step activation. The Edge Function creates the Auth
-- user between claim and completion, and deletes it if completion fails.
create or replace function public.claim_business_team_activation(
  p_login_id text,
  p_code text
)
returns table (
  membership_id uuid,
  storefront_id uuid,
  synthetic_email text,
  full_name text,
  claim_token text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  member public.storefront_team_memberships%rowtype;
  invitation public.storefront_team_invitations%rowtype;
  token text := gen_random_uuid()::text || encode(gen_random_bytes(16), 'hex');
begin
  select membership.* into member
  from public.storefront_team_memberships membership
  where membership.login_id = private.normalize_business_login_id(p_login_id)
    and membership.identity_kind = 'work'
  limit 1;
  if member.id is null or member.status <> 'not_activated' then return; end if;

  select * into invitation
  from public.storefront_team_invitations candidate
  where candidate.membership_id = member.id
  for update;
  if invitation.id is null
    or invitation.consumed_at is not null
    or invitation.revoked_at is not null
    or invitation.expires_at <= now()
    or invitation.attempts >= invitation.max_attempts then
    return;
  end if;

  if invitation.code_hash <> encode(digest(btrim(coalesce(p_code, '')), 'sha256'), 'hex') then
    update public.storefront_team_invitations
    set attempts = attempts + 1, last_attempt_at = now(), updated_at = now()
    where id = invitation.id;
    return;
  end if;

  update public.storefront_team_invitations
  set activation_claim_hash = encode(digest(token, 'sha256'), 'hex'),
      activation_claim_expires_at = now() + interval '5 minutes',
      last_attempt_at = now(),
      updated_at = now()
  where id = invitation.id;

  return query select
    member.id,
    member.storefront_id,
    member.login_id || '@work.social24x7.app',
    member.full_name,
    token;
end;
$$;

create or replace function public.complete_business_team_activation(
  target_member uuid,
  target_auth_user uuid,
  p_claim_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member public.storefront_team_memberships%rowtype;
  invitation public.storefront_team_invitations%rowtype;
begin
  select * into member from public.storefront_team_memberships where id = target_member for update;
  select * into invitation from public.storefront_team_invitations where membership_id = target_member for update;
  if member.id is null or member.status <> 'not_activated' or member.auth_user_id is not null
    or invitation.id is null or invitation.activation_claim_hash is null
    or invitation.activation_claim_expires_at <= now()
    or invitation.activation_claim_hash <> encode(digest(p_claim_token, 'sha256'), 'hex') then
    raise exception 'Activation claim is invalid or expired.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.users identity
    where identity.id = target_auth_user
      and identity.raw_app_meta_data ->> 'account_type' = 'business_employee'
      and identity.raw_app_meta_data ->> 'membership_id' = target_member::text
      and identity.raw_app_meta_data ->> 'storefront_id' = member.storefront_id::text
  ) then
    raise exception 'Work identity does not match this invitation.' using errcode = '42501';
  end if;
  update public.storefront_team_memberships
  set auth_user_id = target_auth_user,
      status = 'awaiting_approval',
      activated_at = now(),
      updated_at = now()
  where id = member.id;
  update public.storefront_team_invitations
  set consumed_at = now(), code_hash = encode(digest(gen_random_uuid()::text, 'sha256'), 'hex'),
      activation_claim_hash = null, activation_claim_expires_at = null, updated_at = now()
  where id = invitation.id;
  insert into public.storefront_team_audit_events (
    storefront_id, membership_id, actor_user_id, event_type
  ) values (member.storefront_id, member.id, target_auth_user, 'activated');
end;
$$;

revoke all on function public.get_my_business_work_context() from public, anon;
revoke all on function public.get_storefront_team_dashboard(uuid) from public, anon;
revoke all on function public.create_storefront_team_invitation(uuid, text, text, text, text, text, text, text, uuid, text[]) from public, anon;
revoke all on function public.resend_storefront_team_activation(uuid) from public, anon;
revoke all on function public.approve_storefront_team_member(uuid) from public, anon;
revoke all on function public.update_storefront_team_member_access(uuid, uuid, text, text, text, text[]) from public, anon;
revoke all on function public.transition_storefront_team_member(uuid, text) from public, anon;
revoke all on function public.create_storefront_team_role(uuid, text, text, text[]) from public, anon;
revoke all on function public.claim_business_team_activation(text, text) from public, anon, authenticated;
revoke all on function public.complete_business_team_activation(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.get_my_business_work_context() to authenticated;
grant execute on function public.get_storefront_team_dashboard(uuid) to authenticated;
grant execute on function public.create_storefront_team_invitation(uuid, text, text, text, text, text, text, text, uuid, text[]) to authenticated;
grant execute on function public.resend_storefront_team_activation(uuid) to authenticated;
grant execute on function public.approve_storefront_team_member(uuid) to authenticated;
grant execute on function public.update_storefront_team_member_access(uuid, uuid, text, text, text, text[]) to authenticated;
grant execute on function public.transition_storefront_team_member(uuid, text) to authenticated;
grant execute on function public.create_storefront_team_role(uuid, text, text, text[]) to authenticated;
grant execute on function public.claim_business_team_activation(text, text) to service_role;
grant execute on function public.complete_business_team_activation(uuid, uuid, text) to service_role;

-- Work identities must never receive personal profile or creator-commerce rows.
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
  if coalesce(new.raw_app_meta_data ->> 'account_type', '') = 'business_employee' then
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
  if coalesce(new.raw_app_meta_data ->> 'account_type', '') = 'business_employee' then
    return new;
  end if;
  insert into public.creator_commerce_access (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
