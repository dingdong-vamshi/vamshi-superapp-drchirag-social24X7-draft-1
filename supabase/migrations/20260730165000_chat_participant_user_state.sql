alter table public.conversation_participants
  add column if not exists archived_at timestamptz,
  add column if not exists manually_unread_at timestamptz;

create index if not exists conversation_participants_user_archived_idx
  on public.conversation_participants (user_id, archived_at);

create index if not exists conversation_participants_user_unread_idx
  on public.conversation_participants (user_id, manually_unread_at);

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'conversation_participants'
      and policyname = 'conversation participants update own read archive state'
  ) then
    create policy "conversation participants update own read archive state"
      on public.conversation_participants
      for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;
