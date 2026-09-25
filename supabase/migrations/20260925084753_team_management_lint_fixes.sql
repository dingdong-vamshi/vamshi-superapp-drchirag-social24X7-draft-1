-- Post-deploy lint fixes: pgcrypto lives in the extensions schema on hosted
-- Supabase, and two PL/pgSQL routines need explicit variable names.

alter function public.create_storefront_team_invitation(uuid, text, text, text, text, text, text, text, uuid, text[])
  set search_path = 'extensions';
alter function public.resend_storefront_team_activation(uuid)
  set search_path = 'extensions';
alter function public.claim_business_team_activation(text, text)
  set search_path = 'extensions';
alter function public.complete_business_team_activation(uuid, uuid, text)
  set search_path = 'extensions';

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
  created_role_id uuid;
  requested_permission text;
begin
  if viewer is null
    or not private.storefront_team_permission(target_storefront, 'business_team_manage') then
    raise exception 'Team management permission required.' using errcode = '42501';
  end if;
  foreach requested_permission in array coalesce(p_permissions, array[]::text[]) loop
    if not exists (
      select 1 from public.storefront_team_permissions catalog
      where catalog.code = requested_permission
    ) then
      raise exception 'Unknown permission: %', requested_permission using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.storefronts storefront
      where storefront.id = target_storefront and storefront.owner_id = viewer
    ) and not private.storefront_team_permission(target_storefront, requested_permission) then
      raise exception 'Cannot grant a permission you do not hold.' using errcode = '42501';
    end if;
  end loop;
  insert into public.storefront_team_roles (
    storefront_id, name, description, is_system, created_by
  ) values (
    target_storefront, btrim(p_name), coalesce(btrim(p_description), ''), false, viewer
  ) returning id into created_role_id;
  insert into public.storefront_team_role_permissions (role_id, permission_code)
  select created_role_id, selected_permission
  from unnest(coalesce(p_permissions, array[]::text[])) as selected_permission;
  insert into public.storefront_team_audit_events (
    storefront_id, actor_user_id, event_type, detail
  ) values (
    target_storefront, viewer, 'role_created',
    jsonb_build_object('roleId', created_role_id, 'name', btrim(p_name))
  );
  return created_role_id;
end;
$$;

create or replace function public.start_business_customer_chat_by_phone(p_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  member public.storefront_team_memberships%rowtype;
  normalized_phone text;
  customer_id uuid;
  target_conversation_id uuid;
  storefront_owner uuid;
  existing_assignment public.business_conversation_assignments%rowtype;
begin
  select * into member
  from public.storefront_team_memberships membership
  where membership.auth_user_id = viewer
    and membership.identity_kind = 'work'
    and membership.status = 'verified'
  limit 1;
  if member.id is null
    or not private.storefront_team_permission(member.storefront_id, 'business_chat_reply') then
    raise exception 'Business chat permission required.' using errcode = '42501';
  end if;
  if (
    select count(*)
    from private.business_customer_lookup_attempts attempt
    where attempt.actor_user_id = viewer
      and attempt.created_at > now() - interval '10 minutes'
  ) >= 10 then
    raise exception 'Too many customer lookup attempts. Try again later.' using errcode = '42501';
  end if;
  normalized_phone := private.normalize_login_phone(p_phone);
  if normalized_phone is null or p_phone ~ '[A-Za-z*%_]' then
    insert into private.business_customer_lookup_attempts(actor_user_id, storefront_id, matched)
    values (viewer, member.storefront_id, false);
    return null;
  end if;
  select credential.user_id into customer_id
  from private.account_phone_credentials credential
  join auth.users identity on identity.id = credential.user_id
  join public.profiles profile on profile.id = credential.user_id
  where credential.phone_e164 = normalized_phone
    and credential.is_legacy_shared = false
    and coalesce(identity.raw_app_meta_data ->> 'account_type', '') <> 'business_employee'
  limit 1;
  insert into private.business_customer_lookup_attempts(actor_user_id, storefront_id, matched)
  values (viewer, member.storefront_id, customer_id is not null);
  if customer_id is null then return null; end if;

  select storefront.owner_id into storefront_owner
  from public.storefronts storefront
  where storefront.id = member.storefront_id
    and storefront.active
    and storefront.verification_status = 'approved';
  if storefront_owner is null then
    raise exception 'Verified storefront is unavailable.' using errcode = '42501';
  end if;

  insert into public.conversations (
    kind, storefront_id, business_customer_id, business_context, created_by
  ) values (
    'business', member.storefront_id, customer_id, 'buyer_seller', viewer
  )
  on conflict (storefront_id, business_customer_id, business_context) where kind = 'business'
  do update set updated_at = public.conversations.updated_at
  returning id into target_conversation_id;

  select * into existing_assignment
  from public.business_conversation_assignments assignment
  where assignment.conversation_id = target_conversation_id
  for update;
  if existing_assignment.assignee_membership_id is not null
    and existing_assignment.assignee_membership_id <> member.id
    and existing_assignment.status = 'open' then
    raise exception 'This customer conversation is already assigned.' using errcode = '23505';
  end if;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (target_conversation_id, customer_id),
    (target_conversation_id, storefront_owner),
    (target_conversation_id, viewer)
  on conflict do nothing;
  insert into public.business_conversation_assignments (
    conversation_id, storefront_id, assignee_membership_id, status, assigned_by, assigned_at
  ) values (
    target_conversation_id, member.storefront_id, member.id, 'open', viewer, now()
  )
  on conflict (conversation_id) do update set
    assignee_membership_id = excluded.assignee_membership_id,
    status = 'open',
    assigned_by = viewer,
    assigned_at = now(),
    resolved_by = null,
    resolved_at = null,
    version = public.business_conversation_assignments.version + 1,
    updated_at = now();
  insert into public.business_conversation_assignment_events (
    conversation_id, storefront_id, previous_assignee_membership_id,
    assignee_membership_id, actor_user_id, event_type
  ) values (
    target_conversation_id, member.storefront_id, existing_assignment.assignee_membership_id,
    member.id, viewer,
    case when existing_assignment.conversation_id is null then 'assigned' else 'reassigned' end
  );
  insert into public.storefront_team_audit_events (
    storefront_id, membership_id, actor_user_id, event_type, detail
  ) values (
    member.storefront_id, member.id, viewer,
    case when existing_assignment.conversation_id is null then 'assigned' else 'reassigned' end,
    jsonb_build_object('conversationId', target_conversation_id)
  );
  return target_conversation_id;
end;
$$;
