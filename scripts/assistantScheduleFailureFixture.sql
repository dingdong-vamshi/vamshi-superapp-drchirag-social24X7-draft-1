-- Transactional QA fixture: prove a worker failure creates one visible,
-- idempotent Assistant history event without changing persistent QA data.
begin;

do $$
declare
  fixture public.scheduled_chat_messages%rowtype;
  delivery_key text;
  entry_count integer;
begin
  select schedule.* into fixture
  from public.scheduled_chat_messages schedule
  where schedule.assistant_action_id is not null
  order by schedule.created_at desc
  limit 1;

  if fixture.id is null then
    raise exception 'Assistant failure fixture needs one existing Assistant schedule.';
  end if;

  fixture.status := 'failed';
  fixture.last_error := 'Automated rollback-only delivery failure fixture.';
  fixture.message_id := null;
  delivery_key := fixture.id::text || ':failed';

  delete from public.ai_assistant_entries
  where metadata->>'delivery_event_key' = delivery_key;

  perform private.record_ai_schedule_terminal_entry(fixture, 'failed');
  perform private.record_ai_schedule_terminal_entry(fixture, 'failed');

  select count(*) into entry_count
  from public.ai_assistant_entries
  where metadata->>'delivery_event_key' = delivery_key
    and entry_type = 'error'
    and display_text like 'Scheduled message delivery failed.%';

  if entry_count <> 1 then
    raise exception 'Expected one failed delivery history entry, found %.', entry_count;
  end if;
end;
$$;

rollback;
