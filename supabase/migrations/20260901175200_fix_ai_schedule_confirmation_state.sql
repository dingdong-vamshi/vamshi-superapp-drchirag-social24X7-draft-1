-- Keep schedule validation failures on the existing Assistant action so the
-- client can render one authoritative card and let the user repair the time.
create or replace function public.ai_edit_action(
  target_action uuid,
  target_body text default null,
  target_send_at timestamptz default null,
  target_timezone text default null
)
returns public.ai_assistant_actions
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid := auth.uid(); action public.ai_assistant_actions;
begin
  select * into action from public.ai_assistant_actions
  where id = target_action and owner_user_id = viewer
    and status = 'proposed' and confirmation_status = 'pending'
  for update;
  if action.id is null then raise exception 'Pending Assistant action was not found.'; end if;
  if target_body is not null then
    if char_length(btrim(target_body)) not between 1 and 2000 then raise exception 'Message cannot be empty.'; end if;
    action.validated_arguments := jsonb_set(action.validated_arguments, '{body}', to_jsonb(btrim(target_body)), true);
  end if;
  if target_send_at is not null then
    if action.action_type <> 'schedule_message' then raise exception 'Only scheduled actions accept a send time.'; end if;
    if target_send_at <= now() + interval '1 minute' then
      raise exception 'Choose a time at least 1 minute from now.';
    end if;
    if target_send_at > now() + interval '30 days' then
      raise exception 'Choose a time within the next 30 days.';
    end if;
    action.validated_arguments := jsonb_set(action.validated_arguments, '{send_at}', to_jsonb(target_send_at), true);
  end if;
  if target_timezone is not null then
    action.validated_arguments := jsonb_set(action.validated_arguments, '{timezone}', to_jsonb(left(btrim(target_timezone), 80)), true);
  end if;
  update public.ai_assistant_actions
  set validated_arguments = action.validated_arguments,
      error = null,
      result = '{}'::jsonb,
      updated_at = now()
  where id = action.id
  returning * into action;
  return action;
end;
$$;

create or replace function public.ai_execute_action(target_action uuid)
returns public.ai_assistant_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  action public.ai_assistant_actions;
  sent_message public.messages;
  scheduled_message public.scheduled_chat_messages;
  scheduled_send_at timestamptz;
  schedule_id uuid;
begin
  if viewer is null then raise exception 'Authentication required.'; end if;
  select * into action from public.ai_assistant_actions
  where id = target_action and owner_user_id = viewer
  for update;
  if action.id is null then raise exception 'Assistant action not found.'; end if;
  if action.status = 'completed' then return action; end if;
  if action.status <> 'proposed' or action.confirmation_status <> 'pending' then
    raise exception 'Assistant action is not awaiting confirmation.';
  end if;

  if action.action_type = 'schedule_message' then
    begin
      scheduled_send_at := (action.validated_arguments->>'send_at')::timestamptz;
    exception when others then
      update public.ai_assistant_actions
      set status = 'proposed', confirmation_status = 'pending',
          error = 'Choose a valid date and time.',
          result = jsonb_build_object('status', 'validation_error'),
          confirmed_at = null, executed_at = null, updated_at = now()
      where id = action.id returning * into action;
      return action;
    end;
    if scheduled_send_at <= now() + interval '1 minute' then
      update public.ai_assistant_actions
      set status = 'proposed', confirmation_status = 'pending',
          error = 'That time has just passed. Choose a new time.',
          result = jsonb_build_object('status', 'validation_error'),
          confirmed_at = null, executed_at = null, updated_at = now()
      where id = action.id returning * into action;
      return action;
    end if;
    if scheduled_send_at > now() + interval '30 days' then
      update public.ai_assistant_actions
      set status = 'proposed', confirmation_status = 'pending',
          error = 'Choose a time within the next 30 days.',
          result = jsonb_build_object('status', 'validation_error'),
          confirmed_at = null, executed_at = null, updated_at = now()
      where id = action.id returning * into action;
      return action;
    end if;
  end if;

  update public.ai_assistant_actions
  set confirmation_status = 'confirmed', status = 'executing', confirmed_at = now(), error = null, updated_at = now()
  where id = action.id;
  begin
    if action.action_type = 'send_message_now' then
      if not private.is_personal_conversation_counterpart(viewer, action.conversation_id, action.target_user_id) then
        raise exception 'Personal Chat authorization changed before send.';
      end if;
      sent_message := public.send_personal_message(
        action.conversation_id,
        action.validated_arguments->>'body',
        'text',
        jsonb_build_object('source', 'ai_assistant', 'assistant_action_id', action.id),
        action.id
      );
      update public.ai_assistant_actions
      set status = 'completed', result = jsonb_build_object('message_id', sent_message.id, 'status', 'sent'),
        error = null, executed_at = now(), updated_at = now()
      where id = action.id returning * into action;
    elsif action.action_type = 'schedule_message' then
      if not private.is_personal_conversation_counterpart(viewer, action.conversation_id, action.target_user_id) then
        raise exception 'Personal Chat authorization changed before scheduling.';
      end if;
      scheduled_message := public.schedule_chat_message(
        action.conversation_id,
        action.validated_arguments->>'body',
        (action.validated_arguments->>'send_at')::timestamptz,
        coalesce(action.validated_arguments->>'timezone', 'UTC'),
        action.id
      );
      update public.scheduled_chat_messages
      set source = 'ai_assistant', assistant_action_id = action.id,
        payload = payload || jsonb_build_object('source', 'ai_assistant', 'assistant_action_id', action.id),
        updated_at = now()
      where id = scheduled_message.id;
      update public.ai_assistant_actions
      set status = 'completed', result = jsonb_build_object('schedule_id', scheduled_message.id, 'status', 'scheduled'),
        error = null, executed_at = now(), updated_at = now()
      where id = action.id returning * into action;
    else
      schedule_id := (action.validated_arguments->>'schedule_id')::uuid;
      perform public.cancel_scheduled_chat_message(schedule_id);
      update public.ai_assistant_actions
      set status = 'completed', result = jsonb_build_object('schedule_id', schedule_id, 'status', 'cancelled'),
        error = null, executed_at = now(), updated_at = now()
      where id = action.id returning * into action;
    end if;
  exception when others then
    if action.action_type = 'schedule_message' and sqlerrm ilike '%Schedule between 1 minute and 30 days%' then
      update public.ai_assistant_actions
      set status = 'proposed', confirmation_status = 'pending',
          error = 'That time has just passed. Choose a new time.',
          result = jsonb_build_object('status', 'validation_error'),
          confirmed_at = null, executed_at = null, updated_at = now()
      where id = action.id returning * into action;
    else
      update public.ai_assistant_actions
      set status = 'failed', error = left(sqlerrm, 500), executed_at = now(), updated_at = now()
      where id = action.id returning * into action;
    end if;
  end;
  return action;
end;
$$;

revoke all on function public.ai_edit_action(uuid, text, timestamptz, text) from public, anon;
revoke all on function public.ai_execute_action(uuid) from public, anon;
grant execute on function public.ai_edit_action(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.ai_execute_action(uuid) to authenticated;
