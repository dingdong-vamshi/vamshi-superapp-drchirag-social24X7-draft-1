-- Fix contextual older-message retrieval. The original ILIKE ESCAPE literal
-- contained two characters under standard_conforming_strings and PostgreSQL
-- rejected any request that reached this fallback branch.

create or replace function public.ai_search_older_chat_messages(
  target_conversation uuid,
  target_query text,
  target_limit integer default 8,
  target_character_limit integer default 4800
)
returns table(
  message_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid := auth.uid(); normalized text := btrim(coalesce(target_query, ''));
begin
  if not private.is_authorized_personal_conversation(viewer, target_conversation) then
    raise exception 'Personal conversation access denied.';
  end if;
  if char_length(normalized) < 2 then return; end if;
  return query
  with matches as (
    select
      message.id,
      message.sender_id,
      message.body,
      message.created_at,
      sum(char_length(coalesce(message.body, ''))) over(
        order by message.created_at desc, message.id desc
      ) as running_characters
    from public.messages message
    where message.conversation_id = target_conversation
      and message.sender_id is not null
      and message.kind = 'text'::public.message_kind
      and message.deleted_at is null
      and (message.expires_at is null or message.expires_at > now())
      and (
        to_tsvector('simple', coalesce(message.body, '')) @@ plainto_tsquery('simple', normalized)
        or position(lower(normalized) in lower(coalesce(message.body, ''))) > 0
      )
    order by message.created_at desc, message.id desc
    limit least(greatest(coalesce(target_limit, 8), 1), 8)
  )
  select matches.id, matches.sender_id, matches.body, matches.created_at
  from matches
  where matches.running_characters <= least(greatest(coalesce(target_character_limit, 4800), 800), 4800)
  order by matches.created_at, matches.id;
end;
$$;

revoke all on function public.ai_search_older_chat_messages(uuid, text, integer, integer)
from public, anon;
grant execute on function public.ai_search_older_chat_messages(uuid, text, integer, integer)
to authenticated;
