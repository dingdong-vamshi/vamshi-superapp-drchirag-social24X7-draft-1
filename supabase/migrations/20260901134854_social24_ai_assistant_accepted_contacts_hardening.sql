-- Global Assistant recipient discovery is intentionally narrower than raw
-- Personal Chat membership: only an accepted Social24 connection is eligible.

begin;

create or replace function public.ai_search_personal_contacts(
  target_query text,
  target_limit integer default 8
)
returns table(
  user_id uuid,
  conversation_id uuid,
  display_name text,
  username text
)
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid := auth.uid(); normalized text := lower(btrim(coalesce(target_query, '')));
begin
  if viewer is null then raise exception 'Authentication required.'; end if;
  return query
  select distinct
    profile.id,
    conversation.id,
    coalesce(nullif(btrim(profile.display_name), ''), profile.username, 'Social24 user'),
    coalesce(profile.username, profile.id::text)
  from public.conversations conversation
  join public.conversation_participants mine
    on mine.conversation_id = conversation.id and mine.user_id = viewer
  join public.conversation_participants other
    on other.conversation_id = conversation.id and other.user_id <> viewer
  join public.profiles profile on profile.id = other.user_id
  where conversation.kind = 'personal'
    and exists (
      select 1
      from public.connection_requests request
      where request.status = 'accepted'
        and (
          (request.requester_id = viewer and request.recipient_id = profile.id)
          or (request.recipient_id = viewer and request.requester_id = profile.id)
        )
    )
    and (
      normalized = ''
      or lower(coalesce(profile.display_name, '')) like '%' || normalized || '%'
      or lower(coalesce(profile.username, '')) like '%' || replace(normalized, '@', '') || '%'
    )
  order by 3, 4
  limit least(greatest(coalesce(target_limit, 8), 1), 20);
end;
$$;

revoke all on function public.ai_search_personal_contacts(text, integer) from public, anon;
grant execute on function public.ai_search_personal_contacts(text, integer) to authenticated;

commit;
