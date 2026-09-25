-- Close the remaining Team Management runtime gaps found during production
-- reconciliation. The lookup-attempt ledger is internal-only, but enabling
-- RLS keeps it protected even if the private schema is exposed later.

alter table private.business_customer_lookup_attempts enable row level security;

-- These helpers are called only by trusted SECURITY DEFINER routines and a
-- trigger. Authenticated clients have USAGE on the private schema for the two
-- RLS predicates, so the default PUBLIC execute grant must not remain here.
revoke all on function private.business_representative_payload(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function private.chat_send_permitted(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.reopen_business_conversation_after_customer_message()
  from public, anon, authenticated;

alter table public.storefront_team_audit_events
  drop constraint storefront_team_audit_events_type_check;

alter table public.storefront_team_audit_events
  add constraint storefront_team_audit_events_type_check
  check (event_type in (
    'invited', 'activation_resent', 'activated', 'approved', 'role_changed',
    'permissions_changed', 'profile_updated', 'assigned', 'reassigned',
    'resolved', 'reopened', 'suspended', 'removed', 'reactivated',
    'role_created', 'role_updated', 'role_archived'
  ));

-- The client edits a member's customer-facing profile and access in one save.
-- Keep the operation atomic while delegating the existing role/permission
-- validation to update_storefront_team_member_access.
create or replace function public.update_storefront_team_member(
  target_member uuid,
  p_role_id uuid,
  p_full_name text,
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
  normalized_name text := btrim(coalesce(p_full_name, ''));
begin
  select * into member
  from public.storefront_team_memberships
  where id = target_member
  for update;

  if member.id is null
    or not private.storefront_team_permission(
      member.storefront_id,
      'business_team_manage'
    ) then
    raise exception 'Team management permission required.' using errcode = '42501';
  end if;
  if member.identity_kind = 'owner_personal' then
    raise exception 'The root Owner membership cannot be edited.' using errcode = '42501';
  end if;
  if char_length(normalized_name) not between 2 and 100 then
    raise exception 'Member name must use 2-100 characters.' using errcode = '22023';
  end if;

  perform public.update_storefront_team_member_access(
    target_member,
    p_role_id,
    p_customer_tagline,
    p_job_title,
    p_department,
    p_permissions
  );

  if member.full_name is distinct from normalized_name then
    update public.storefront_team_memberships
    set full_name = normalized_name,
        updated_at = now()
    where id = member.id;

    insert into public.storefront_team_audit_events (
      storefront_id,
      membership_id,
      actor_user_id,
      event_type,
      detail
    ) values (
      member.storefront_id,
      member.id,
      viewer,
      'profile_updated',
      jsonb_build_object('fields', jsonb_build_array('full_name'))
    );
  end if;
end;
$$;

revoke all on function public.update_storefront_team_member(
  uuid, uuid, text, text, text, text, text[]
) from public, anon;

grant execute on function public.update_storefront_team_member(
  uuid, uuid, text, text, text, text, text[]
) to authenticated;
