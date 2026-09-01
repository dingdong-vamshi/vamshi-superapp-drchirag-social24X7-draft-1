-- Realtime Assistant terminal delivery state. The worker owns both the
-- authoritative card transition and exactly one durable history entry.

begin;

create unique index if not exists ai_assistant_entries_delivery_event_key
  on public.ai_assistant_entries ((metadata->>'delivery_event_key'))
  where metadata ? 'delivery_event_key';

create or replace function private.record_ai_schedule_terminal_entry(
  target_schedule public.scheduled_chat_messages,
  target_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_key text := target_schedule.id::text || ':' || target_status;
begin
  if target_schedule.assistant_action_id is null
    or target_status not in ('sent', 'failed', 'cancelled') then
    return;
  end if;

  insert into public.ai_assistant_entries(
    thread_id,
    owner_user_id,
    conversation_id,
    role,
    entry_type,
    display_text,
    metadata
  )
  select
    action.thread_id,
    action.owner_user_id,
    action.conversation_id,
    'system',
    case when target_status = 'sent' then 'status' else 'error' end,
    case target_status
      when 'sent' then
        'Scheduled message sent to ' ||
        coalesce(nullif(action.validated_arguments->>'recipient_label', ''), 'your contact') || '.'
      when 'cancelled' then
        'Scheduled message was cancelled before delivery. ' ||
        coalesce(target_schedule.last_error, 'Delivery permission changed.')
      else
        'Scheduled message delivery failed. ' ||
        coalesce(target_schedule.last_error, 'Please try scheduling it again.')
    end,
    jsonb_build_object(
      'delivery_event_key', delivery_key,
      'schedule_id', target_schedule.id,
      'assistant_action_id', target_schedule.assistant_action_id,
      'schedule_status', target_status,
      'message_id', target_schedule.message_id
    )
  from public.ai_assistant_actions action
  where action.id = target_schedule.assistant_action_id
    and action.owner_user_id = target_schedule.created_by
  on conflict ((metadata->>'delivery_event_key'))
    where metadata ? 'delivery_event_key'
    do nothing;
end;
$$;

revoke all on function private.record_ai_schedule_terminal_entry(
  public.scheduled_chat_messages,
  text
) from public, anon, authenticated;

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
        perform private.record_ai_schedule_terminal_entry(schedule_row, 'cancelled');
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
      where id = schedule_row.id
      returning * into schedule_row;
      if schedule_row.assistant_action_id is not null then
        update public.ai_assistant_actions
        set result = result || jsonb_build_object(
              'message_id', inserted_message.id,
              'schedule_status', 'sent'
            ),
            updated_at = now()
        where id = schedule_row.assistant_action_id
          and owner_user_id = schedule_row.created_by;
        perform private.record_ai_schedule_terminal_entry(schedule_row, 'sent');
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
        perform private.record_ai_schedule_terminal_entry(schedule_row, 'failed');
      end if;
    end;
  end loop;
  return sent_count;
end;
$$;

revoke all on function public.process_scheduled_chat_messages(integer) from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'ai_assistant_actions',
    'ai_assistant_entries',
    'scheduled_chat_messages'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

commit;
