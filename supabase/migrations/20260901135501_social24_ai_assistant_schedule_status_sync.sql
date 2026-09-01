-- Keep the Assistant action card synchronized with the authoritative schedule
-- terminal state, including revocation and terminal worker failure.

begin;

create or replace function public.process_scheduled_chat_messages(target_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare schedule_row public.scheduled_chat_messages%rowtype; inserted_message public.messages; sent_count integer := 0;
begin
  for schedule_row in
    select * from public.scheduled_chat_messages
    where status = 'pending' and send_at <= now()
    order by send_at, id
    for update skip locked
    limit least(greatest(coalesce(target_limit, 50), 1), 100)
  loop
    if not private.chat_send_permitted(schedule_row.created_by, schedule_row.conversation_id) then
      update public.scheduled_chat_messages
      set status = 'cancelled', last_error = 'Conversation delivery permission was revoked before send.', updated_at = now()
      where id = schedule_row.id
      returning * into schedule_row;
      if schedule_row.assistant_action_id is not null then
        update public.ai_assistant_actions
        set result = result || jsonb_build_object(
              'schedule_status', 'cancelled',
              'error', schedule_row.last_error
            ),
            updated_at = now()
        where id = schedule_row.assistant_action_id
          and owner_user_id = schedule_row.created_by;
      end if;
      continue;
    end if;
    begin
      update public.scheduled_chat_messages
      set status = 'sending', attempts = attempts + 1, updated_at = now()
      where id = schedule_row.id;
      inserted_message := private.deliver_chat_text_message(
        schedule_row.created_by,
        schedule_row.conversation_id,
        schedule_row.body,
        schedule_row.payload,
        schedule_row.idempotency_key
      );
      update public.scheduled_chat_messages
      set status = 'sent', message_id = inserted_message.id, last_error = null, updated_at = now()
      where id = schedule_row.id;
      if schedule_row.assistant_action_id is not null then
        update public.ai_assistant_actions
        set result = result || jsonb_build_object(
              'message_id', inserted_message.id,
              'schedule_status', 'sent'
            ),
            updated_at = now()
        where id = schedule_row.assistant_action_id
          and owner_user_id = schedule_row.created_by;
      end if;
      sent_count := sent_count + 1;
    exception when others then
      update public.scheduled_chat_messages
      set status = case when attempts >= 5 then 'failed' else 'pending' end,
        last_error = left(sqlerrm, 500), updated_at = now()
      where id = schedule_row.id
      returning * into schedule_row;
      if schedule_row.status = 'failed' and schedule_row.assistant_action_id is not null then
        update public.ai_assistant_actions
        set result = result || jsonb_build_object(
              'schedule_status', 'failed',
              'error', schedule_row.last_error
            ),
            updated_at = now()
        where id = schedule_row.assistant_action_id
          and owner_user_id = schedule_row.created_by;
      end if;
    end;
  end loop;
  return sent_count;
end;
$$;

revoke all on function public.process_scheduled_chat_messages(integer) from public, anon, authenticated;

commit;
