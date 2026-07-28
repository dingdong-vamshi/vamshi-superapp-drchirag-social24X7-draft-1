create schema if not exists private;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.expense_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('income', 'expense')),
  amount_minor bigint not null check (amount_minor > 0),
  title text not null check (char_length(title) between 1 and 120),
  category text not null check (char_length(category) between 1 and 60),
  subcategory text,
  entry_date date not null default current_date,
  notes text not null default '' check (char_length(notes) <= 1000),
  payment_method text not null default 'other' check (char_length(payment_method) <= 60),
  source_label text not null default '' check (char_length(source_label) <= 80),
  recurring_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expense_transactions_owner_idx on public.expense_transactions(owner_id);
create index if not exists expense_transactions_owner_date_idx on public.expense_transactions(owner_id, entry_date desc);
create index if not exists expense_transactions_owner_category_idx on public.expense_transactions(owner_id, category);

create table if not exists public.chit_groups (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  manager_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  duration_cycles integer not null check (duration_cycles between 1 and 240),
  contribution_frequency text not null check (contribution_frequency in ('weekly', 'monthly', 'quarterly', 'custom')),
  contribution_amount_minor bigint not null check (contribution_amount_minor >= 0),
  interest_bps integer not null default 0 check (interest_bps between 0 and 100000),
  start_date date,
  member_limit integer not null default 10 check (member_limit between 1 and 1000),
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chit_groups_manager_idx on public.chit_groups(manager_id);
create index if not exists chit_groups_status_idx on public.chit_groups(status);

create table if not exists public.chit_group_members (
  group_id uuid not null references public.chit_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('manager', 'accountant', 'member')),
  contribution_status text not null default 'pending' check (contribution_status in ('pending', 'paid', 'partial')),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists chit_group_members_user_idx on public.chit_group_members(user_id);

create table if not exists public.chit_group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chit_groups(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  proposed_role text not null default 'member' check (proposed_role in ('accountant', 'member')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, invitee_id)
);

create index if not exists chit_group_invitations_invitee_idx on public.chit_group_invitations(invitee_id, status);

create table if not exists public.chit_group_contributions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chit_groups(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  recorded_by uuid not null references public.profiles(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  cycle_number integer not null default 1 check (cycle_number > 0),
  contribution_date date not null default current_date,
  status text not null default 'completed' check (status in ('pending', 'completed')),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chit_group_contributions_group_idx on public.chit_group_contributions(group_id, contribution_date desc);
create index if not exists chit_group_contributions_member_idx on public.chit_group_contributions(member_id);

create table if not exists public.chit_group_loans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chit_groups(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  approved_by uuid references public.profiles(id) on delete set null,
  amount_minor bigint not null check (amount_minor > 0),
  purpose text not null check (char_length(purpose) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'repaid')),
  interest_bps integer not null default 0 check (interest_bps between 0 and 100000),
  requested_at timestamptz not null default now(),
  decision_at timestamptz,
  next_payment_date date,
  due_date date,
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chit_group_loans_group_idx on public.chit_group_loans(group_id, requested_at desc);
create index if not exists chit_group_loans_requester_idx on public.chit_group_loans(requester_id);

create table if not exists public.chit_group_loan_repayments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.chit_group_loans(id) on delete cascade,
  group_id uuid not null references public.chit_groups(id) on delete cascade,
  payer_id uuid not null references public.profiles(id) on delete cascade,
  recorded_by uuid not null references public.profiles(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  payment_date date not null default current_date,
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists chit_group_loan_repayments_loan_idx on public.chit_group_loan_repayments(loan_id, payment_date desc);

create table if not exists public.chit_group_activities (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.chit_groups(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  activity_type text not null check (char_length(activity_type) between 1 and 80),
  entity_type text not null default '' check (char_length(entity_type) <= 80),
  entity_id uuid,
  amount_minor bigint,
  status text not null default '' check (char_length(status) <= 40),
  detail text not null default '' check (char_length(detail) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists chit_group_activities_group_idx on public.chit_group_activities(group_id, created_at desc);

create table if not exists public.bill_split_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  category text not null default '' check (char_length(category) <= 60),
  avatar_label text not null default '' check (char_length(avatar_label) <= 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bill_split_groups_owner_idx on public.bill_split_groups(owner_id);

create table if not exists public.bill_split_members (
  group_id uuid not null references public.bill_split_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists bill_split_members_user_idx on public.bill_split_members(user_id);

create table if not exists public.bill_split_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.bill_split_groups(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, invitee_id)
);

create index if not exists bill_split_invitations_invitee_idx on public.bill_split_invitations(invitee_id, status);

create table if not exists public.bill_split_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.bill_split_groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  paid_by_user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  total_minor bigint not null check (total_minor > 0),
  expense_date date not null default current_date,
  category text not null default 'Other' check (char_length(category) <= 60),
  notes text not null default '' check (char_length(notes) <= 1000),
  split_type text not null check (split_type in ('equal', 'exact')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists bill_split_expenses_group_idx on public.bill_split_expenses(group_id, expense_date desc);

create table if not exists public.bill_split_expense_participants (
  expense_id uuid not null references public.bill_split_expenses(id) on delete cascade,
  participant_user_id uuid not null references public.profiles(id) on delete cascade,
  share_minor bigint not null check (share_minor >= 0),
  primary key (expense_id, participant_user_id)
);

create index if not exists bill_split_expense_participants_user_idx on public.bill_split_expense_participants(participant_user_id);

create table if not exists public.bill_split_settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.bill_split_groups(id) on delete cascade,
  payer_id uuid not null references public.profiles(id) on delete cascade,
  payee_id uuid not null references public.profiles(id) on delete cascade,
  recorded_by uuid not null references public.profiles(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  settlement_date date not null default current_date,
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists bill_split_settlements_group_idx on public.bill_split_settlements(group_id, settlement_date desc);

create table if not exists public.bill_split_activities (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.bill_split_groups(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  activity_type text not null check (char_length(activity_type) between 1 and 80),
  entity_type text not null default '' check (char_length(entity_type) <= 80),
  entity_id uuid,
  amount_minor bigint,
  detail text not null default '' check (char_length(detail) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists bill_split_activities_group_idx on public.bill_split_activities(group_id, created_at desc);

create table if not exists public.qa_topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  label text not null unique check (char_length(label) between 2 and 60),
  description text not null default '' check (char_length(description) <= 240),
  icon_emoji text not null default '💬' check (char_length(icon_emoji) <= 8),
  created_at timestamptz not null default now()
);

create table if not exists public.qa_topic_follows (
  topic_id uuid not null references public.qa_topics(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (topic_id, user_id)
);

create table if not exists public.qa_questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 8 and 180),
  body text not null check (char_length(body) between 1 and 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists qa_questions_author_idx on public.qa_questions(author_id);
create index if not exists qa_questions_created_idx on public.qa_questions(created_at desc);

create table if not exists public.qa_question_topics (
  question_id uuid not null references public.qa_questions(id) on delete cascade,
  topic_id uuid not null references public.qa_topics(id) on delete cascade,
  primary key (question_id, topic_id)
);

create table if not exists public.qa_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.qa_questions(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists qa_answers_question_idx on public.qa_answers(question_id, created_at asc);

create table if not exists public.qa_question_votes (
  question_id uuid not null references public.qa_questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

create table if not exists public.qa_question_bookmarks (
  question_id uuid not null references public.qa_questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

create table if not exists public.qa_question_views (
  question_id uuid not null references public.qa_questions(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, viewer_id)
);

create or replace function private.is_chit_member(target_group uuid, actor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.chit_group_members m
    where m.group_id = target_group
      and m.user_id = actor
  );
$$;

create or replace function private.is_chit_manager(target_group uuid, actor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.chit_group_members m
    where m.group_id = target_group
      and m.user_id = actor
      and m.role in ('manager', 'accountant')
  );
$$;

create or replace function private.is_chit_authorized(target_group uuid, actor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    private.is_chit_member(target_group, actor)
    or exists(
      select 1
      from public.chit_group_invitations i
      where i.group_id = target_group
        and i.invitee_id = actor
        and i.status = 'pending'
    );
$$;

create or replace function private.is_bill_member(target_group uuid, actor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.bill_split_members m
    where m.group_id = target_group
      and m.user_id = actor
  );
$$;

create or replace function private.is_bill_owner(target_group uuid, actor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.bill_split_groups g
    where g.id = target_group
      and g.owner_id = actor
  );
$$;

create or replace function private.is_bill_authorized(target_group uuid, actor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    private.is_bill_member(target_group, actor)
    or exists(
      select 1
      from public.bill_split_invitations i
      where i.group_id = target_group
        and i.invitee_id = actor
        and i.status = 'pending'
    );
$$;

alter table public.expense_transactions enable row level security;
alter table public.chit_groups enable row level security;
alter table public.chit_group_members enable row level security;
alter table public.chit_group_invitations enable row level security;
alter table public.chit_group_contributions enable row level security;
alter table public.chit_group_loans enable row level security;
alter table public.chit_group_loan_repayments enable row level security;
alter table public.chit_group_activities enable row level security;
alter table public.bill_split_groups enable row level security;
alter table public.bill_split_members enable row level security;
alter table public.bill_split_invitations enable row level security;
alter table public.bill_split_expenses enable row level security;
alter table public.bill_split_expense_participants enable row level security;
alter table public.bill_split_settlements enable row level security;
alter table public.bill_split_activities enable row level security;
alter table public.qa_topics enable row level security;
alter table public.qa_topic_follows enable row level security;
alter table public.qa_questions enable row level security;
alter table public.qa_question_topics enable row level security;
alter table public.qa_answers enable row level security;
alter table public.qa_question_votes enable row level security;
alter table public.qa_question_bookmarks enable row level security;
alter table public.qa_question_views enable row level security;

drop policy if exists "expense owner select" on public.expense_transactions;
create policy "expense owner select" on public.expense_transactions
for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "expense owner insert" on public.expense_transactions;
create policy "expense owner insert" on public.expense_transactions
for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "expense owner update" on public.expense_transactions;
create policy "expense owner update" on public.expense_transactions
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "expense owner delete" on public.expense_transactions;
create policy "expense owner delete" on public.expense_transactions
for delete to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "chit groups authorized select" on public.chit_groups;
create policy "chit groups authorized select" on public.chit_groups
for select to authenticated
using (private.is_chit_authorized(id, (select auth.uid())));

drop policy if exists "chit groups creator insert" on public.chit_groups;
create policy "chit groups creator insert" on public.chit_groups
for insert to authenticated
with check ((select auth.uid()) = created_by and (select auth.uid()) = manager_id);

drop policy if exists "chit groups manager update" on public.chit_groups;
create policy "chit groups manager update" on public.chit_groups
for update to authenticated
using (private.is_chit_manager(id, (select auth.uid())))
with check (private.is_chit_manager(id, (select auth.uid())));

drop policy if exists "chit groups manager delete" on public.chit_groups;
create policy "chit groups manager delete" on public.chit_groups
for delete to authenticated
using (private.is_chit_manager(id, (select auth.uid())));

drop policy if exists "chit members authorized select" on public.chit_group_members;
create policy "chit members authorized select" on public.chit_group_members
for select to authenticated
using (private.is_chit_authorized(group_id, (select auth.uid())));

drop policy if exists "chit members self join" on public.chit_group_members;
create policy "chit members self join" on public.chit_group_members
for insert to authenticated
with check (
  (user_id = (select auth.uid()) and exists (
    select 1
    from public.chit_group_invitations i
    where i.group_id = chit_group_members.group_id
      and i.invitee_id = (select auth.uid())
      and i.status = 'accepted'
  ))
  or private.is_chit_manager(group_id, (select auth.uid()))
);

drop policy if exists "chit members manager update" on public.chit_group_members;
create policy "chit members manager update" on public.chit_group_members
for update to authenticated
using (private.is_chit_manager(group_id, (select auth.uid())))
with check (private.is_chit_manager(group_id, (select auth.uid())));

drop policy if exists "chit members manager delete" on public.chit_group_members;
create policy "chit members manager delete" on public.chit_group_members
for delete to authenticated
using (private.is_chit_manager(group_id, (select auth.uid())));

drop policy if exists "chit invitations select" on public.chit_group_invitations;
create policy "chit invitations select" on public.chit_group_invitations
for select to authenticated
using (invitee_id = (select auth.uid()) or private.is_chit_manager(group_id, (select auth.uid())));

drop policy if exists "chit invitations manager insert" on public.chit_group_invitations;
create policy "chit invitations manager insert" on public.chit_group_invitations
for insert to authenticated
with check (private.is_chit_manager(group_id, (select auth.uid())) and invited_by = (select auth.uid()) and invitee_id <> (select auth.uid()));

drop policy if exists "chit invitations self or manager update" on public.chit_group_invitations;
create policy "chit invitations self or manager update" on public.chit_group_invitations
for update to authenticated
using (invitee_id = (select auth.uid()) or private.is_chit_manager(group_id, (select auth.uid())))
with check (invitee_id = (select auth.uid()) or private.is_chit_manager(group_id, (select auth.uid())));

drop policy if exists "chit contributions select" on public.chit_group_contributions;
create policy "chit contributions select" on public.chit_group_contributions
for select to authenticated
using (private.is_chit_authorized(group_id, (select auth.uid())));

drop policy if exists "chit contributions insert" on public.chit_group_contributions;
create policy "chit contributions insert" on public.chit_group_contributions
for insert to authenticated
with check (
  private.is_chit_member(group_id, (select auth.uid()))
  and (member_id = (select auth.uid()) or private.is_chit_manager(group_id, (select auth.uid())))
  and recorded_by = (select auth.uid())
);

drop policy if exists "chit contributions manager update" on public.chit_group_contributions;
create policy "chit contributions manager update" on public.chit_group_contributions
for update to authenticated
using (private.is_chit_manager(group_id, (select auth.uid())))
with check (private.is_chit_manager(group_id, (select auth.uid())));

drop policy if exists "chit loans select" on public.chit_group_loans;
create policy "chit loans select" on public.chit_group_loans
for select to authenticated
using (private.is_chit_authorized(group_id, (select auth.uid())));

drop policy if exists "chit loans create" on public.chit_group_loans;
create policy "chit loans create" on public.chit_group_loans
for insert to authenticated
with check (private.is_chit_member(group_id, (select auth.uid())) and requester_id = (select auth.uid()));

drop policy if exists "chit loans manager update" on public.chit_group_loans;
create policy "chit loans manager update" on public.chit_group_loans
for update to authenticated
using (private.is_chit_manager(group_id, (select auth.uid())) or requester_id = (select auth.uid()))
with check (private.is_chit_manager(group_id, (select auth.uid())) or requester_id = (select auth.uid()));

drop policy if exists "chit repayments select" on public.chit_group_loan_repayments;
create policy "chit repayments select" on public.chit_group_loan_repayments
for select to authenticated
using (private.is_chit_authorized(group_id, (select auth.uid())));

drop policy if exists "chit repayments insert" on public.chit_group_loan_repayments;
create policy "chit repayments insert" on public.chit_group_loan_repayments
for insert to authenticated
with check (
  private.is_chit_member(group_id, (select auth.uid()))
  and recorded_by = (select auth.uid())
  and (payer_id = (select auth.uid()) or private.is_chit_manager(group_id, (select auth.uid())))
);

drop policy if exists "chit activities select" on public.chit_group_activities;
create policy "chit activities select" on public.chit_group_activities
for select to authenticated
using (private.is_chit_authorized(group_id, (select auth.uid())));

drop policy if exists "chit activities insert" on public.chit_group_activities;
create policy "chit activities insert" on public.chit_group_activities
for insert to authenticated
with check (private.is_chit_member(group_id, (select auth.uid())) and actor_id = (select auth.uid()));

drop policy if exists "bill groups authorized select" on public.bill_split_groups;
create policy "bill groups authorized select" on public.bill_split_groups
for select to authenticated
using (private.is_bill_authorized(id, (select auth.uid())));

drop policy if exists "bill groups owner insert" on public.bill_split_groups;
create policy "bill groups owner insert" on public.bill_split_groups
for insert to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists "bill groups owner update" on public.bill_split_groups;
create policy "bill groups owner update" on public.bill_split_groups
for update to authenticated
using (private.is_bill_owner(id, (select auth.uid())))
with check (private.is_bill_owner(id, (select auth.uid())));

drop policy if exists "bill members select" on public.bill_split_members;
create policy "bill members select" on public.bill_split_members
for select to authenticated
using (private.is_bill_authorized(group_id, (select auth.uid())));

drop policy if exists "bill members self join" on public.bill_split_members;
create policy "bill members self join" on public.bill_split_members
for insert to authenticated
with check (
  (user_id = (select auth.uid()) and exists (
    select 1
    from public.bill_split_invitations i
    where i.group_id = bill_split_members.group_id
      and i.invitee_id = (select auth.uid())
      and i.status = 'accepted'
  ))
  or private.is_bill_owner(group_id, (select auth.uid()))
);

drop policy if exists "bill members owner delete" on public.bill_split_members;
create policy "bill members owner delete" on public.bill_split_members
for delete to authenticated
using (private.is_bill_owner(group_id, (select auth.uid())));

drop policy if exists "bill invitations select" on public.bill_split_invitations;
create policy "bill invitations select" on public.bill_split_invitations
for select to authenticated
using (invitee_id = (select auth.uid()) or private.is_bill_owner(group_id, (select auth.uid())));

drop policy if exists "bill invitations owner insert" on public.bill_split_invitations;
create policy "bill invitations owner insert" on public.bill_split_invitations
for insert to authenticated
with check (private.is_bill_owner(group_id, (select auth.uid())) and invited_by = (select auth.uid()) and invitee_id <> (select auth.uid()));

drop policy if exists "bill invitations self or owner update" on public.bill_split_invitations;
create policy "bill invitations self or owner update" on public.bill_split_invitations
for update to authenticated
using (invitee_id = (select auth.uid()) or private.is_bill_owner(group_id, (select auth.uid())))
with check (invitee_id = (select auth.uid()) or private.is_bill_owner(group_id, (select auth.uid())));

drop policy if exists "bill expenses select" on public.bill_split_expenses;
create policy "bill expenses select" on public.bill_split_expenses
for select to authenticated
using (private.is_bill_authorized(group_id, (select auth.uid())));

drop policy if exists "bill expenses insert" on public.bill_split_expenses;
create policy "bill expenses insert" on public.bill_split_expenses
for insert to authenticated
with check (private.is_bill_member(group_id, (select auth.uid())) and created_by = (select auth.uid()));

drop policy if exists "bill expenses update" on public.bill_split_expenses;
create policy "bill expenses update" on public.bill_split_expenses
for update to authenticated
using (private.is_bill_member(group_id, (select auth.uid())) and created_by = (select auth.uid()))
with check (private.is_bill_member(group_id, (select auth.uid())) and created_by = (select auth.uid()));

drop policy if exists "bill shares select" on public.bill_split_expense_participants;
create policy "bill shares select" on public.bill_split_expense_participants
for select to authenticated
using (exists (
  select 1
  from public.bill_split_expenses e
  where e.id = bill_split_expense_participants.expense_id
    and private.is_bill_authorized(e.group_id, (select auth.uid()))
));

drop policy if exists "bill shares insert" on public.bill_split_expense_participants;
create policy "bill shares insert" on public.bill_split_expense_participants
for insert to authenticated
with check (exists (
  select 1
  from public.bill_split_expenses e
  where e.id = bill_split_expense_participants.expense_id
    and e.created_by = (select auth.uid())
    and private.is_bill_member(e.group_id, (select auth.uid()))
));

drop policy if exists "bill shares update" on public.bill_split_expense_participants;
create policy "bill shares update" on public.bill_split_expense_participants
for update to authenticated
using (exists (
  select 1
  from public.bill_split_expenses e
  where e.id = bill_split_expense_participants.expense_id
    and e.created_by = (select auth.uid())
    and private.is_bill_member(e.group_id, (select auth.uid()))
))
with check (exists (
  select 1
  from public.bill_split_expenses e
  where e.id = bill_split_expense_participants.expense_id
    and e.created_by = (select auth.uid())
    and private.is_bill_member(e.group_id, (select auth.uid()))
));

drop policy if exists "bill settlements select" on public.bill_split_settlements;
create policy "bill settlements select" on public.bill_split_settlements
for select to authenticated
using (private.is_bill_authorized(group_id, (select auth.uid())));

drop policy if exists "bill settlements insert" on public.bill_split_settlements;
create policy "bill settlements insert" on public.bill_split_settlements
for insert to authenticated
with check (private.is_bill_member(group_id, (select auth.uid())) and recorded_by = (select auth.uid()));

drop policy if exists "bill activities select" on public.bill_split_activities;
create policy "bill activities select" on public.bill_split_activities
for select to authenticated
using (private.is_bill_authorized(group_id, (select auth.uid())));

drop policy if exists "bill activities insert" on public.bill_split_activities;
create policy "bill activities insert" on public.bill_split_activities
for insert to authenticated
with check (private.is_bill_member(group_id, (select auth.uid())) and actor_id = (select auth.uid()));

drop policy if exists "qa topics authenticated read" on public.qa_topics;
create policy "qa topics authenticated read" on public.qa_topics
for select to authenticated
using (true);

drop policy if exists "qa topic follows read" on public.qa_topic_follows;
create policy "qa topic follows read" on public.qa_topic_follows
for select to authenticated
using (true);

drop policy if exists "qa topic follows self insert" on public.qa_topic_follows;
create policy "qa topic follows self insert" on public.qa_topic_follows
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "qa topic follows self delete" on public.qa_topic_follows;
create policy "qa topic follows self delete" on public.qa_topic_follows
for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "qa questions authenticated read" on public.qa_questions;
create policy "qa questions authenticated read" on public.qa_questions
for select to authenticated
using (deleted_at is null);

drop policy if exists "qa questions self insert" on public.qa_questions;
create policy "qa questions self insert" on public.qa_questions
for insert to authenticated
with check (author_id = (select auth.uid()));

drop policy if exists "qa questions self update" on public.qa_questions;
create policy "qa questions self update" on public.qa_questions
for update to authenticated
using (author_id = (select auth.uid()))
with check (author_id = (select auth.uid()));

drop policy if exists "qa question topics read" on public.qa_question_topics;
create policy "qa question topics read" on public.qa_question_topics
for select to authenticated
using (true);

drop policy if exists "qa question topics author insert" on public.qa_question_topics;
create policy "qa question topics author insert" on public.qa_question_topics
for insert to authenticated
with check (exists (
  select 1
  from public.qa_questions q
  where q.id = qa_question_topics.question_id
    and q.author_id = (select auth.uid())
));

drop policy if exists "qa question topics author delete" on public.qa_question_topics;
create policy "qa question topics author delete" on public.qa_question_topics
for delete to authenticated
using (exists (
  select 1
  from public.qa_questions q
  where q.id = qa_question_topics.question_id
    and q.author_id = (select auth.uid())
));

drop policy if exists "qa answers authenticated read" on public.qa_answers;
create policy "qa answers authenticated read" on public.qa_answers
for select to authenticated
using (deleted_at is null);

drop policy if exists "qa answers self insert" on public.qa_answers;
create policy "qa answers self insert" on public.qa_answers
for insert to authenticated
with check (author_id = (select auth.uid()));

drop policy if exists "qa answers self update" on public.qa_answers;
create policy "qa answers self update" on public.qa_answers
for update to authenticated
using (author_id = (select auth.uid()))
with check (author_id = (select auth.uid()));

drop policy if exists "qa votes read" on public.qa_question_votes;
create policy "qa votes read" on public.qa_question_votes
for select to authenticated
using (true);

drop policy if exists "qa votes self insert" on public.qa_question_votes;
create policy "qa votes self insert" on public.qa_question_votes
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "qa votes self delete" on public.qa_question_votes;
create policy "qa votes self delete" on public.qa_question_votes
for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "qa bookmarks self read" on public.qa_question_bookmarks;
create policy "qa bookmarks self read" on public.qa_question_bookmarks
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "qa bookmarks self insert" on public.qa_question_bookmarks;
create policy "qa bookmarks self insert" on public.qa_question_bookmarks
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "qa bookmarks self delete" on public.qa_question_bookmarks;
create policy "qa bookmarks self delete" on public.qa_question_bookmarks
for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "qa views read" on public.qa_question_views;
create policy "qa views read" on public.qa_question_views
for select to authenticated
using (true);

drop policy if exists "qa views self insert" on public.qa_question_views;
create policy "qa views self insert" on public.qa_question_views
for insert to authenticated
with check (viewer_id = (select auth.uid()));

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.expense_transactions to authenticated;
grant select, insert, update, delete on public.chit_groups to authenticated;
grant select, insert, update, delete on public.chit_group_members to authenticated;
grant select, insert, update on public.chit_group_invitations to authenticated;
grant select, insert, update on public.chit_group_contributions to authenticated;
grant select, insert, update on public.chit_group_loans to authenticated;
grant select, insert on public.chit_group_loan_repayments to authenticated;
grant select, insert on public.chit_group_activities to authenticated;
grant select, insert, update on public.bill_split_groups to authenticated;
grant select, insert, delete on public.bill_split_members to authenticated;
grant select, insert, update on public.bill_split_invitations to authenticated;
grant select, insert, update on public.bill_split_expenses to authenticated;
grant select, insert, update on public.bill_split_expense_participants to authenticated;
grant select, insert on public.bill_split_settlements to authenticated;
grant select, insert on public.bill_split_activities to authenticated;
grant select on public.qa_topics to authenticated;
grant select, insert, delete on public.qa_topic_follows to authenticated;
grant select, insert, update on public.qa_questions to authenticated;
grant select, insert, delete on public.qa_question_topics to authenticated;
grant select, insert, update on public.qa_answers to authenticated;
grant select, insert, delete on public.qa_question_votes to authenticated;
grant select, insert, delete on public.qa_question_bookmarks to authenticated;
grant select, insert on public.qa_question_views to authenticated;
grant usage, select on all sequences in schema public to authenticated;

insert into public.qa_topics (slug, label, description, icon_emoji)
values
  ('technology', 'Technology', 'Programming, AI, and tech trends', '💻'),
  ('career', 'Career', 'Job advice, interviews, and growth', '💼'),
  ('finance', 'Finance', 'Investment, savings, and economics', '💰')
on conflict (slug) do update
set label = excluded.label,
    description = excluded.description,
    icon_emoji = excluded.icon_emoji;

drop trigger if exists expense_transactions_touch_updated_at on public.expense_transactions;
create trigger expense_transactions_touch_updated_at before update on public.expense_transactions
for each row execute function private.touch_updated_at();

drop trigger if exists chit_groups_touch_updated_at on public.chit_groups;
create trigger chit_groups_touch_updated_at before update on public.chit_groups
for each row execute function private.touch_updated_at();

drop trigger if exists chit_group_members_touch_updated_at on public.chit_group_members;
create trigger chit_group_members_touch_updated_at before update on public.chit_group_members
for each row execute function private.touch_updated_at();

drop trigger if exists chit_group_invitations_touch_updated_at on public.chit_group_invitations;
create trigger chit_group_invitations_touch_updated_at before update on public.chit_group_invitations
for each row execute function private.touch_updated_at();

drop trigger if exists chit_group_contributions_touch_updated_at on public.chit_group_contributions;
create trigger chit_group_contributions_touch_updated_at before update on public.chit_group_contributions
for each row execute function private.touch_updated_at();

drop trigger if exists chit_group_loans_touch_updated_at on public.chit_group_loans;
create trigger chit_group_loans_touch_updated_at before update on public.chit_group_loans
for each row execute function private.touch_updated_at();

drop trigger if exists bill_split_groups_touch_updated_at on public.bill_split_groups;
create trigger bill_split_groups_touch_updated_at before update on public.bill_split_groups
for each row execute function private.touch_updated_at();

drop trigger if exists bill_split_members_touch_updated_at on public.bill_split_members;
create trigger bill_split_members_touch_updated_at before update on public.bill_split_members
for each row execute function private.touch_updated_at();

drop trigger if exists bill_split_invitations_touch_updated_at on public.bill_split_invitations;
create trigger bill_split_invitations_touch_updated_at before update on public.bill_split_invitations
for each row execute function private.touch_updated_at();

drop trigger if exists bill_split_expenses_touch_updated_at on public.bill_split_expenses;
create trigger bill_split_expenses_touch_updated_at before update on public.bill_split_expenses
for each row execute function private.touch_updated_at();

drop trigger if exists qa_questions_touch_updated_at on public.qa_questions;
create trigger qa_questions_touch_updated_at before update on public.qa_questions
for each row execute function private.touch_updated_at();

drop trigger if exists qa_answers_touch_updated_at on public.qa_answers;
create trigger qa_answers_touch_updated_at before update on public.qa_answers
for each row execute function private.touch_updated_at();

revoke all on schema private from public;
revoke all privileges on all functions in schema private from public;
