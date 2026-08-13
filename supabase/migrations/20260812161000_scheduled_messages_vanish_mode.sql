-- Batch F: server-authoritative scheduled text messages and restricted Vanish
-- Mode. Authoritative commerce/system events can never expire.

alter table public.messages add column if not exists expires_at timestamptz;

alter table public.messages drop constraint if exists messages_authoritative_never_expire_check;
alter table public.messages add constraint messages_authoritative_never_expire_check
check (kind not in ('order'::public.message_kind,'system'::public.message_kind) or expires_at is null);

create index if not exists messages_expiry_idx on public.messages(expires_at)
where expires_at is not null and deleted_at is null;

create table if not exists public.chat_conversation_settings (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  vanish_seconds integer,
  updated_by uuid not null references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now(),
  constraint chat_conversation_settings_vanish_check check (vanish_seconds is null or vanish_seconds in (86400,604800,2592000))
);

create table if not exists public.scheduled_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  send_at timestamptz not null,
  timezone text not null,
  status text not null default 'pending',
  kind text not null default 'text',
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key uuid not null default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete set null,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_chat_messages_status_check check (status in ('pending','sending','sent','failed','cancelled')),
  constraint scheduled_chat_messages_kind_check check (kind = 'text'),
  constraint scheduled_chat_messages_body_check check (char_length(body) between 1 and 2000),
  constraint scheduled_chat_messages_attempts_check check (attempts between 0 and 5),
  unique (created_by,idempotency_key)
);

create index if not exists scheduled_chat_messages_due_idx
on public.scheduled_chat_messages(send_at,id) where status='pending';

alter table public.chat_conversation_settings enable row level security;
alter table public.scheduled_chat_messages enable row level security;
revoke all on table public.chat_conversation_settings,public.scheduled_chat_messages from public,anon,authenticated;
grant select on table public.chat_conversation_settings to authenticated;
grant select on table public.scheduled_chat_messages to authenticated;

drop policy if exists chat_conversation_settings_member_read on public.chat_conversation_settings;
create policy chat_conversation_settings_member_read on public.chat_conversation_settings for select to authenticated
using(public.is_conversation_member(conversation_id));

drop policy if exists scheduled_chat_messages_creator_read on public.scheduled_chat_messages;
create policy scheduled_chat_messages_creator_read on public.scheduled_chat_messages for select to authenticated
using(created_by=(select auth.uid()));

create or replace function public.set_chat_vanish_mode(target_conversation uuid,target_seconds integer)
returns public.chat_conversation_settings
language plpgsql
security definer
set search_path=''
as $$
declare viewer uuid:=auth.uid(); result public.chat_conversation_settings;
begin
  if viewer is null or not public.is_conversation_member(target_conversation) then raise exception 'Conversation access denied.'; end if;
  if target_seconds is not null and target_seconds not in (86400,604800,2592000) then raise exception 'Unsupported Vanish Mode duration.'; end if;
  insert into public.chat_conversation_settings(conversation_id,vanish_seconds,updated_by)
  values(target_conversation,target_seconds,viewer)
  on conflict(conversation_id) do update set vanish_seconds=excluded.vanish_seconds,updated_by=excluded.updated_by,updated_at=now()
  returning * into result;
  return result;
end;
$$;

create or replace function private.apply_chat_vanish_expiry()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare seconds integer;
begin
  if new.sender_id is null or new.kind in ('order'::public.message_kind,'system'::public.message_kind) then
    new.expires_at:=null;
    return new;
  end if;
  select vanish_seconds into seconds from public.chat_conversation_settings where conversation_id=new.conversation_id;
  if seconds is not null then new.expires_at:=new.created_at+make_interval(secs=>seconds); end if;
  return new;
end;
$$;

drop trigger if exists messages_apply_vanish_expiry on public.messages;
create trigger messages_apply_vanish_expiry
before insert on public.messages
for each row execute function private.apply_chat_vanish_expiry();

create or replace function public.schedule_chat_message(
  target_conversation uuid,
  target_body text,
  target_send_at timestamptz,
  target_timezone text,
  target_idempotency_key uuid default gen_random_uuid()
)
returns public.scheduled_chat_messages
language plpgsql
security definer
set search_path=''
as $$
declare viewer uuid:=auth.uid(); result public.scheduled_chat_messages;
begin
  if viewer is null or not public.is_conversation_member(target_conversation) then raise exception 'Conversation access denied.'; end if;
  if char_length(btrim(coalesce(target_body,''))) not between 1 and 2000 then raise exception 'Scheduled message cannot be empty.'; end if;
  if target_send_at <= now()+interval '1 minute' or target_send_at > now()+interval '30 days' then raise exception 'Schedule between 1 minute and 30 days from now.'; end if;
  insert into public.scheduled_chat_messages(conversation_id,created_by,send_at,timezone,body,idempotency_key)
  values(target_conversation,viewer,target_send_at,left(coalesce(nullif(btrim(target_timezone),''),'UTC'),80),btrim(target_body),target_idempotency_key)
  on conflict(created_by,idempotency_key) do update set updated_at=public.scheduled_chat_messages.updated_at
  returning * into result;
  return result;
end;
$$;

create or replace function public.cancel_scheduled_chat_message(target_schedule uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.scheduled_chat_messages set status='cancelled',updated_at=now()
  where id=target_schedule and created_by=auth.uid() and status='pending';
  if not found then raise exception 'Pending scheduled message was not found.'; end if;
end;
$$;

create or replace function public.process_scheduled_chat_messages(target_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare schedule_row public.scheduled_chat_messages%rowtype; inserted_message public.messages; sent_count integer:=0;
begin
  for schedule_row in
    select * from public.scheduled_chat_messages
    where status='pending' and send_at<=now()
    order by send_at,id
    for update skip locked
    limit least(greatest(coalesce(target_limit,50),1),100)
  loop
    begin
      update public.scheduled_chat_messages set status='sending',attempts=attempts+1,updated_at=now() where id=schedule_row.id;
      if not exists(select 1 from public.conversation_participants where conversation_id=schedule_row.conversation_id and user_id=schedule_row.created_by) then
        raise exception 'Creator is no longer a conversation participant.';
      end if;
      insert into public.messages(conversation_id,sender_id,kind,body,payload,client_id)
      values(schedule_row.conversation_id,schedule_row.created_by,'text'::public.message_kind,schedule_row.body,schedule_row.payload,schedule_row.idempotency_key)
      returning * into inserted_message;
      update public.scheduled_chat_messages set status='sent',message_id=inserted_message.id,last_error=null,updated_at=now() where id=schedule_row.id;
      update public.conversations set updated_at=inserted_message.created_at where id=schedule_row.conversation_id;
      sent_count:=sent_count+1;
    exception when others then
      update public.scheduled_chat_messages
      set attempts=attempts+1,status=case when attempts+1>=5 then 'failed' else 'pending' end,last_error=left(sqlerrm,500),updated_at=now()
      where id=schedule_row.id;
    end;
  end loop;
  return sent_count;
end;
$$;

create or replace function public.cleanup_expired_chat_messages(target_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare expired_ids uuid[]; paths text[]; cleaned integer:=0;
begin
  select array_agg(id) into expired_ids from (
    select id from public.messages
    where expires_at<=now() and deleted_at is null
      and sender_id is not null
      and kind not in ('order'::public.message_kind,'system'::public.message_kind)
    order by expires_at,id
    for update skip locked
    limit least(greatest(coalesce(target_limit,200),1),500)
  ) due;
  if expired_ids is null then return 0; end if;
  select array_agg(attachment.storage_path) into paths
  from public.chat_attachments attachment
  join public.messages message on message.payload->>'attachment_id'=attachment.id::text
  where message.id=any(expired_ids) and attachment.storage_bucket='chat-media';
  if paths is not null then delete from storage.objects where bucket_id='chat-media' and name=any(paths); end if;
  update public.chat_attachments set status='deleted'
  where id::text in(select message.payload->>'attachment_id' from public.messages message where message.id=any(expired_ids) and message.payload?'attachment_id');
  update public.messages set body='',payload=jsonb_build_object('expired',true),deleted_at=now() where id=any(expired_ids);
  get diagnostics cleaned=row_count;
  return cleaned;
end;
$$;

revoke all on function public.set_chat_vanish_mode(uuid,integer) from public;
revoke all on function public.schedule_chat_message(uuid,text,timestamptz,text,uuid) from public;
revoke all on function public.cancel_scheduled_chat_message(uuid) from public;
revoke all on function public.process_scheduled_chat_messages(integer) from public,anon,authenticated;
revoke all on function public.cleanup_expired_chat_messages(integer) from public,anon,authenticated;
grant execute on function public.set_chat_vanish_mode(uuid,integer) to authenticated;
grant execute on function public.schedule_chat_message(uuid,text,timestamptz,text,uuid) to authenticated;
grant execute on function public.cancel_scheduled_chat_message(uuid) to authenticated;

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='social24x7-process-scheduled-chat' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('social24x7-process-scheduled-chat','* * * * *','select public.process_scheduled_chat_messages(50);');
  select jobid into existing_job from cron.job where jobname='social24x7-cleanup-vanish-chat' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('social24x7-cleanup-vanish-chat','*/5 * * * *','select public.cleanup_expired_chat_messages(200);');
end;
$$;
