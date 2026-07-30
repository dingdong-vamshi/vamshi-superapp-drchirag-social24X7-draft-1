-- Make the "Invite accepted connection" actions behave like direct member adds.
-- The app already filters invite candidates to accepted connections. These RPCs keep
-- the database writes atomic and idempotent while preserving RLS as security invoker.

create or replace function public.add_chit_group_member_atomic(
  p_group_id uuid,
  p_invitee_id uuid,
  p_role text default 'member'
)
returns public.chit_group_invitations
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation public.chit_group_invitations;
begin
  if v_actor is null then
    raise exception 'You need to sign in first.';
  end if;

  if p_invitee_id is null or p_invitee_id = v_actor then
    raise exception 'Choose another user to invite.';
  end if;

  if p_role not in ('accountant', 'member') then
    raise exception 'Unsupported chit member role.';
  end if;

  if not private.is_chit_manager(p_group_id, v_actor) then
    raise exception 'Only the chit manager can invite members.';
  end if;

  if not exists (
    select 1
    from public.connection_requests cr
    where cr.status = 'accepted'
      and (
        (cr.requester_id = v_actor and cr.recipient_id = p_invitee_id)
        or
        (cr.requester_id = p_invitee_id and cr.recipient_id = v_actor)
      )
  ) then
    raise exception 'Invitee must be an accepted connection.';
  end if;

  insert into public.chit_group_invitations (
    group_id,
    invitee_id,
    invited_by,
    proposed_role,
    status,
    responded_at
  )
  values (
    p_group_id,
    p_invitee_id,
    v_actor,
    p_role,
    'accepted',
    now()
  )
  on conflict (group_id, invitee_id) do update
    set invited_by = excluded.invited_by,
        proposed_role = excluded.proposed_role,
        status = 'accepted',
        responded_at = now(),
        updated_at = now()
  returning * into v_invitation;

  insert into public.chit_group_members (
    group_id,
    user_id,
    role,
    contribution_status
  )
  values (
    p_group_id,
    p_invitee_id,
    p_role,
    'pending'
  )
  on conflict (group_id, user_id) do update
    set role = excluded.role,
        updated_at = now();

  insert into public.chit_group_activities (
    group_id,
    actor_id,
    activity_type,
    entity_type,
    entity_id,
    status,
    detail
  )
  values (
    p_group_id,
    v_actor,
    'member_added',
    'member',
    p_invitee_id,
    'accepted',
    'Added an accepted connection to the chit fund group.'
  );

  return v_invitation;
end;
$$;

grant execute on function public.add_chit_group_member_atomic(
  uuid,
  uuid,
  text
) to authenticated;

create or replace function public.add_bill_split_member_atomic(
  p_group_id uuid,
  p_invitee_id uuid
)
returns public.bill_split_invitations
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation public.bill_split_invitations;
begin
  if v_actor is null then
    raise exception 'You need to sign in first.';
  end if;

  if p_invitee_id is null or p_invitee_id = v_actor then
    raise exception 'Choose another user to invite.';
  end if;

  if not private.is_bill_owner(p_group_id, v_actor) then
    raise exception 'Only the bill group owner can invite members.';
  end if;

  if not exists (
    select 1
    from public.connection_requests cr
    where cr.status = 'accepted'
      and (
        (cr.requester_id = v_actor and cr.recipient_id = p_invitee_id)
        or
        (cr.requester_id = p_invitee_id and cr.recipient_id = v_actor)
      )
  ) then
    raise exception 'Invitee must be an accepted connection.';
  end if;

  insert into public.bill_split_invitations (
    group_id,
    invitee_id,
    invited_by,
    status,
    responded_at
  )
  values (
    p_group_id,
    p_invitee_id,
    v_actor,
    'accepted',
    now()
  )
  on conflict (group_id, invitee_id) do update
    set invited_by = excluded.invited_by,
        status = 'accepted',
        responded_at = now(),
        updated_at = now()
  returning * into v_invitation;

  insert into public.bill_split_members (
    group_id,
    user_id
  )
  values (
    p_group_id,
    p_invitee_id
  )
  on conflict (group_id, user_id) do update
    set updated_at = now();

  insert into public.bill_split_activities (
    group_id,
    actor_id,
    activity_type,
    entity_type,
    entity_id,
    detail
  )
  values (
    p_group_id,
    v_actor,
    'member_added',
    'member',
    p_invitee_id,
    'Added an accepted connection to the bill split group.'
  );

  return v_invitation;
end;
$$;

grant execute on function public.add_bill_split_member_atomic(
  uuid,
  uuid
) to authenticated;
