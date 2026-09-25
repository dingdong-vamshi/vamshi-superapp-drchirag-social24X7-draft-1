-- Let previous and next assignees receive the PII-free assignment event that
-- tells an already-open workspace to refresh its authorized inbox.

drop policy if exists business_conversation_assignment_events_authorized_read
on public.business_conversation_assignment_events;

create policy business_conversation_assignment_events_authorized_read
on public.business_conversation_assignment_events
for select
to authenticated
using (
  private.can_read_business_assignment(conversation_id)
  or exists (
    select 1
    from public.storefront_team_memberships member
    where member.storefront_id = business_conversation_assignment_events.storefront_id
      and member.auth_user_id = auth.uid()
      and member.id in (
        business_conversation_assignment_events.previous_assignee_membership_id,
        business_conversation_assignment_events.assignee_membership_id
      )
  )
);
