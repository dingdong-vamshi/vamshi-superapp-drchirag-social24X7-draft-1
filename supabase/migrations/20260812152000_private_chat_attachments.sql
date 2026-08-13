-- Batch D: private, participant-scoped chat attachments and core structured
-- location/contact messages. Binary objects remain in Storage; Realtime carries
-- only finalized metadata through messages.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  false,
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/pdf', 'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  storage_bucket text not null default 'chat-media',
  storage_path text not null,
  attachment_type text not null,
  original_filename text not null,
  mime_type text not null,
  bytes integer not null,
  width integer,
  height integer,
  duration_ms integer,
  source text not null,
  status text not null default 'finalized',
  created_at timestamptz not null default now(),
  constraint chat_attachments_bucket_check check (storage_bucket = 'chat-media'),
  constraint chat_attachments_type_check check (attachment_type in ('image','video','document')),
  constraint chat_attachments_source_check check (source in ('camera_capture','gallery','document_picker','document_scan')),
  constraint chat_attachments_status_check check (status in ('finalized','failed','deleted')),
  constraint chat_attachments_bytes_check check (bytes between 1 and 26214400),
  constraint chat_attachments_dimensions_check check (
    (width is null or width > 0) and (height is null or height > 0) and (duration_ms is null or duration_ms >= 0)
  ),
  unique (storage_path)
);

create index if not exists chat_attachments_conversation_idx
  on public.chat_attachments (conversation_id, created_at desc);

alter table public.chat_attachments enable row level security;
revoke all on table public.chat_attachments from public, anon, authenticated;
grant select on table public.chat_attachments to authenticated;

drop policy if exists chat_attachments_member_read on public.chat_attachments;
create policy chat_attachments_member_read
on public.chat_attachments
for select
to authenticated
using (public.is_conversation_member(conversation_id));

create or replace function private.can_write_chat_media_path(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    split_part(object_name, '/', 2) = auth.uid()::text
    and public.is_conversation_member(split_part(object_name, '/', 1)::uuid);
$$;

create or replace function private.can_read_chat_media_path(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_attachments attachment
    where attachment.storage_bucket = 'chat-media'
      and attachment.storage_path = object_name
      and attachment.status = 'finalized'
      and public.is_conversation_member(attachment.conversation_id)
  );
$$;

revoke all on function private.can_write_chat_media_path(text) from public;
revoke all on function private.can_read_chat_media_path(text) from public;
grant execute on function private.can_write_chat_media_path(text) to authenticated;
grant execute on function private.can_read_chat_media_path(text) to authenticated;

drop policy if exists chat_media_member_read on storage.objects;
create policy chat_media_member_read
on storage.objects
for select
to authenticated
using (bucket_id = 'chat-media' and private.can_read_chat_media_path(name));

drop policy if exists chat_media_sender_insert on storage.objects;
create policy chat_media_sender_insert
on storage.objects
for insert
to authenticated
with check (bucket_id = 'chat-media' and private.can_write_chat_media_path(name));

drop policy if exists chat_media_sender_update on storage.objects;
create policy chat_media_sender_update
on storage.objects
for update
to authenticated
using (bucket_id = 'chat-media' and private.can_write_chat_media_path(name))
with check (bucket_id = 'chat-media' and private.can_write_chat_media_path(name));

drop policy if exists chat_media_sender_delete on storage.objects;
create policy chat_media_sender_delete
on storage.objects
for delete
to authenticated
using (bucket_id = 'chat-media' and private.can_write_chat_media_path(name));

drop policy if exists "messages participant send" on public.messages;
create policy "messages participant send"
on public.messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and public.is_conversation_member(conversation_id)
  and kind in (
    'text'::public.message_kind,
    'image'::public.message_kind,
    'video'::public.message_kind,
    'file'::public.message_kind,
    'voice'::public.message_kind,
    'product'::public.message_kind,
    'cart'::public.message_kind,
    'location'::public.message_kind,
    'contact'::public.message_kind,
    'poll'::public.message_kind,
    'event'::public.message_kind
  )
);

create or replace function public.send_chat_attachment(
  target_conversation uuid,
  target_storage_path text,
  target_filename text,
  target_mime_type text,
  target_bytes integer,
  target_width integer default null,
  target_height integer default null,
  target_duration_ms integer default null,
  target_source text default 'gallery'
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  attachment_type text;
  attachment_id uuid;
  message_kind public.message_kind;
  inserted_message public.messages;
  storage_size integer;
  storage_mime text;
begin
  if viewer is null or not public.is_conversation_member(target_conversation) then
    raise exception 'Conversation access denied.';
  end if;
  if split_part(target_storage_path, '/', 1) <> target_conversation::text
    or split_part(target_storage_path, '/', 2) <> viewer::text then
    raise exception 'Attachment path is invalid.';
  end if;
  if target_source not in ('camera_capture','gallery','document_picker','document_scan') then
    raise exception 'Attachment source is invalid.';
  end if;
  if target_bytes not between 1 and 26214400 then
    raise exception 'Attachment must be 25 MiB or smaller.';
  end if;

  attachment_type := case
    when target_mime_type in ('image/jpeg','image/png','image/webp') then 'image'
    when target_mime_type in ('video/mp4','video/quicktime','video/webm') then 'video'
    when target_mime_type in (
      'application/pdf','text/plain','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) then 'document'
    else null
  end;
  if attachment_type is null then
    raise exception 'Unsupported attachment type.';
  end if;

  select
    nullif((object.metadata ->> 'size')::integer, 0),
    nullif(object.metadata ->> 'mimetype', '')
  into storage_size, storage_mime
  from storage.objects object
  where object.bucket_id = 'chat-media'
    and object.name = target_storage_path
    and object.owner_id = viewer::text;

  if not found then
    raise exception 'Uploaded attachment was not found.';
  end if;
  if storage_size is not null and storage_size <> target_bytes then
    raise exception 'Attachment size does not match the uploaded object.';
  end if;
  if storage_mime is not null and storage_mime <> target_mime_type then
    raise exception 'Attachment MIME does not match the uploaded object.';
  end if;

  insert into public.chat_attachments (
    conversation_id, sender_id, storage_path, attachment_type,
    original_filename, mime_type, bytes, width, height, duration_ms, source
  ) values (
    target_conversation, viewer, target_storage_path, attachment_type,
    left(coalesce(nullif(btrim(target_filename), ''), 'attachment'), 180),
    target_mime_type, target_bytes, target_width, target_height,
    target_duration_ms, target_source
  )
  returning id into attachment_id;

  message_kind := case attachment_type
    when 'image' then 'image'::public.message_kind
    when 'video' then 'video'::public.message_kind
    else 'file'::public.message_kind
  end;

  insert into public.messages (
    conversation_id, sender_id, kind, body, payload, client_id
  ) values (
    target_conversation,
    viewer,
    message_kind,
    case when attachment_type = 'document' then target_filename else attachment_type end,
    jsonb_strip_nulls(jsonb_build_object(
      'version', 1,
      'attachment_id', attachment_id,
      'attachment_type', attachment_type,
      'filename', target_filename,
      'mime_type', target_mime_type,
      'bytes', target_bytes,
      'width', target_width,
      'height', target_height,
      'duration_ms', target_duration_ms,
      'source', target_source
    )),
    gen_random_uuid()
  )
  returning * into inserted_message;

  update public.conversations set updated_at = inserted_message.created_at where id = target_conversation;
  return inserted_message;
end;
$$;

revoke all on function public.send_chat_attachment(uuid,text,text,text,integer,integer,integer,integer,text) from public;
grant execute on function public.send_chat_attachment(uuid,text,text,text,integer,integer,integer,integer,text) to authenticated;

create or replace function public.send_structured_chat_message(
  target_conversation uuid,
  target_kind text,
  target_payload jsonb
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  safe_payload jsonb;
  inserted_message public.messages;
  shared_profile record;
  latitude double precision;
  longitude double precision;
  accuracy double precision;
begin
  if viewer is null or not public.is_conversation_member(target_conversation) then
    raise exception 'Conversation access denied.';
  end if;

  if target_kind = 'location' then
    latitude := (target_payload ->> 'latitude')::double precision;
    longitude := (target_payload ->> 'longitude')::double precision;
    accuracy := nullif(target_payload ->> 'accuracy', '')::double precision;
    if latitude not between -90 and 90 or longitude not between -180 and 180
      or (accuracy is not null and accuracy < 0) then
      raise exception 'Location payload is invalid.';
    end if;
    safe_payload := jsonb_strip_nulls(jsonb_build_object(
      'version', 1,
      'latitude', latitude,
      'longitude', longitude,
      'accuracy', accuracy,
      'label', left(nullif(btrim(target_payload ->> 'label'), ''), 120),
      'captured_at', coalesce(nullif(target_payload ->> 'captured_at', ''), now()::text)
    ));
  elsif target_kind = 'contact' then
    select profile.id, profile.display_name, profile.username
    into shared_profile
    from public.profiles profile
    where profile.id = (target_payload ->> 'profile_id')::uuid;
    if not found then raise exception 'Shared Social 24x7 profile was not found.'; end if;
    safe_payload := jsonb_build_object(
      'version', 1,
      'profile_id', shared_profile.id,
      'display_name', coalesce(nullif(shared_profile.display_name, ''), shared_profile.username, 'Social 24x7 user'),
      'username', coalesce(shared_profile.username, '')
    );
  else
    raise exception 'Unsupported structured message kind.';
  end if;

  insert into public.messages (conversation_id, sender_id, kind, body, payload, client_id)
  values (
    target_conversation,
    viewer,
    target_kind::public.message_kind,
    case when target_kind = 'location' then 'Shared a location' else 'Shared a contact' end,
    safe_payload,
    gen_random_uuid()
  )
  returning * into inserted_message;

  update public.conversations set updated_at = inserted_message.created_at where id = target_conversation;
  return inserted_message;
end;
$$;

revoke all on function public.send_structured_chat_message(uuid,text,jsonb) from public;
grant execute on function public.send_structured_chat_message(uuid,text,jsonb) to authenticated;
