-- Make Chit Fund and Bill Split create flows visible and atomic under RLS.
-- The frontend creates groups as authenticated users; the creator/owner must be
-- able to read the newly-created group before member rows exist.

drop policy if exists "chit groups authorized select" on public.chit_groups;

create policy "chit groups authorized select"
on public.chit_groups
for select
to authenticated
using (
  created_by = (select auth.uid())
  or manager_id = (select auth.uid())
  or private.is_chit_authorized(id, (select auth.uid()))
);

drop policy if exists "bill groups authorized select" on public.bill_split_groups;

create policy "bill groups authorized select"
on public.bill_split_groups
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or private.is_bill_authorized(id, (select auth.uid()))
);

create or replace function public.create_chit_group_atomic(
  p_name text,
  p_description text,
  p_duration_cycles integer,
  p_contribution_frequency text,
  p_contribution_amount_minor bigint,
  p_interest_bps integer,
  p_start_date date,
  p_member_limit integer,
  p_status text
)
returns public.chit_groups
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_group public.chit_groups;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Group name must be at least 2 characters.';
  end if;

  insert into public.chit_groups (
    created_by,
    manager_id,
    name,
    description,
    duration_cycles,
    contribution_frequency,
    contribution_amount_minor,
    interest_bps,
    start_date,
    member_limit,
    status
  )
  values (
    v_actor,
    v_actor,
    trim(p_name),
    trim(coalesce(p_description, '')),
    p_duration_cycles,
    p_contribution_frequency,
    p_contribution_amount_minor,
    p_interest_bps,
    p_start_date,
    p_member_limit,
    p_status
  )
  returning * into v_group;

  insert into public.chit_group_members (
    group_id,
    user_id,
    role,
    contribution_status
  )
  values (
    v_group.id,
    v_actor,
    'manager',
    'pending'
  );

  insert into public.chit_group_activities (
    group_id,
    actor_id,
    activity_type,
    entity_type,
    entity_id,
    amount_minor,
    status,
    detail
  )
  values (
    v_group.id,
    v_actor,
    'group_created',
    'group',
    v_group.id,
    null,
    'recorded',
    'Created the chit fund group.'
  );

  return v_group;
end;
$$;

grant execute on function public.create_chit_group_atomic(
  text,
  text,
  integer,
  text,
  bigint,
  integer,
  date,
  integer,
  text
) to authenticated;

create or replace function public.create_bill_split_group_atomic(
  p_name text,
  p_description text,
  p_category text,
  p_avatar_label text
)
returns public.bill_split_groups
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_group public.bill_split_groups;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Group name must be at least 2 characters.';
  end if;

  insert into public.bill_split_groups (
    owner_id,
    name,
    description,
    category,
    avatar_label
  )
  values (
    v_actor,
    trim(p_name),
    trim(coalesce(p_description, '')),
    coalesce(nullif(trim(coalesce(p_category, '')), ''), 'General'),
    left(coalesce(nullif(trim(coalesce(p_avatar_label, '')), ''), 'BS'), 4)
  )
  returning * into v_group;

  insert into public.bill_split_members (group_id, user_id)
  values (v_group.id, v_actor);

  insert into public.bill_split_activities (
    group_id,
    actor_id,
    activity_type,
    entity_type,
    entity_id,
    amount_minor,
    detail
  )
  values (
    v_group.id,
    v_actor,
    'group_created',
    'group',
    v_group.id,
    null,
    'Created the bill split group.'
  );

  return v_group;
end;
$$;

grant execute on function public.create_bill_split_group_atomic(
  text,
  text,
  text,
  text
) to authenticated;

create or replace function public.add_bill_split_expense_atomic(
  p_group_id uuid,
  p_title text,
  p_total_minor bigint,
  p_paid_by_user_id uuid,
  p_expense_date date,
  p_category text,
  p_notes text,
  p_split_type text,
  p_shares jsonb
)
returns public.bill_split_expenses
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_expense public.bill_split_expenses;
  v_share_sum bigint;
  v_share_count integer;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if not private.is_bill_member(p_group_id, v_actor) then
    raise exception 'You are not a member of this bill split group.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.bill_split_members
    where group_id = p_group_id and user_id = p_paid_by_user_id
  ) then
    raise exception 'Paid-by user must be a group member.';
  end if;

  if p_total_minor <= 0 then
    raise exception 'Expense amount must be greater than zero.';
  end if;

  if p_split_type not in ('equal', 'exact') then
    raise exception 'Unsupported split type.';
  end if;

  if jsonb_typeof(p_shares) <> 'array' then
    raise exception 'Expense shares must be an array.';
  end if;

  select coalesce(sum(share_minor), 0), count(*)
  into v_share_sum, v_share_count
  from jsonb_to_recordset(p_shares) as share_rows(
    participant_user_id uuid,
    share_minor bigint
  );

  if v_share_count = 0 then
    raise exception 'Add at least one participant.';
  end if;

  if v_share_sum <> p_total_minor then
    raise exception 'Participant shares must add up to the total expense amount.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_shares) as share_rows(
      participant_user_id uuid,
      share_minor bigint
    )
    where share_minor < 0
  ) then
    raise exception 'Participant shares cannot be negative.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_shares) as share_rows(
      participant_user_id uuid,
      share_minor bigint
    )
    where not exists (
      select 1
      from public.bill_split_members member_rows
      where member_rows.group_id = p_group_id
        and member_rows.user_id = share_rows.participant_user_id
    )
  ) then
    raise exception 'Every participant must be a group member.';
  end if;

  insert into public.bill_split_expenses (
    group_id,
    created_by,
    paid_by_user_id,
    title,
    total_minor,
    expense_date,
    category,
    notes,
    split_type
  )
  values (
    p_group_id,
    v_actor,
    p_paid_by_user_id,
    trim(p_title),
    p_total_minor,
    p_expense_date,
    coalesce(nullif(trim(coalesce(p_category, '')), ''), 'Other'),
    trim(coalesce(p_notes, '')),
    p_split_type
  )
  returning * into v_expense;

  insert into public.bill_split_expense_participants (
    expense_id,
    participant_user_id,
    share_minor
  )
  select
    v_expense.id,
    share_rows.participant_user_id,
    share_rows.share_minor
  from jsonb_to_recordset(p_shares) as share_rows(
    participant_user_id uuid,
    share_minor bigint
  );

  insert into public.bill_split_activities (
    group_id,
    actor_id,
    activity_type,
    entity_type,
    entity_id,
    amount_minor,
    detail
  )
  values (
    p_group_id,
    v_actor,
    'expense_created',
    'expense',
    v_expense.id,
    p_total_minor,
    trim(p_title)
  );

  return v_expense;
end;
$$;

grant execute on function public.add_bill_split_expense_atomic(
  uuid,
  text,
  bigint,
  uuid,
  date,
  text,
  text,
  text,
  jsonb
) to authenticated;
