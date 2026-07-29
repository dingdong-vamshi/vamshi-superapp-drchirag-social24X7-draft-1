drop policy if exists "chit creator can add self as manager" on public.chit_group_members;
create policy "chit creator can add self as manager"
on public.chit_group_members
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'manager'
  and exists (
    select 1
    from public.chit_groups g
    where g.id = chit_group_members.group_id
      and g.created_by = (select auth.uid())
      and g.manager_id = (select auth.uid())
  )
);

drop policy if exists "bill owner can add self as member" on public.bill_split_members;
create policy "bill owner can add self as member"
on public.bill_split_members
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.bill_split_groups g
    where g.id = bill_split_members.group_id
      and g.owner_id = (select auth.uid())
  )
);
