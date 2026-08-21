-- Keep visual wallpaper choices private to each conversation member and raise
-- the validated chat attachment ceiling for ordinary phone-recorded videos.

create table if not exists public.chat_wallpaper_preferences (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  wallpaper_style text not null default 'neutral'
    check (wallpaper_style in ('neutral', 'sky', 'forest', 'warm', 'paper')),
  wallpaper_image_path text,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.chat_wallpaper_preferences enable row level security;
revoke all on public.chat_wallpaper_preferences from public, anon, authenticated;
grant select on public.chat_wallpaper_preferences to authenticated;

drop policy if exists chat_wallpaper_owner_read on public.chat_wallpaper_preferences;
create policy chat_wallpaper_owner_read on public.chat_wallpaper_preferences
for select to authenticated
using (user_id = (select auth.uid()) and public.is_conversation_member(conversation_id));

insert into public.chat_wallpaper_preferences(
  conversation_id, user_id, wallpaper_style, wallpaper_image_path, updated_at
)
select conversation_id, updated_by, wallpaper_style, wallpaper_image_path, updated_at
from public.chat_conversation_settings
where updated_by is not null
on conflict (conversation_id, user_id) do nothing;

create or replace function public.set_my_chat_wallpaper(
  target_conversation uuid,
  target_wallpaper text
)
returns public.chat_wallpaper_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  result public.chat_wallpaper_preferences;
begin
  if viewer is null or not public.is_conversation_member(target_conversation) then
    raise exception 'Conversation access denied.';
  end if;
  if target_wallpaper not in ('neutral', 'sky', 'forest', 'warm', 'paper') then
    raise exception 'Wallpaper is invalid.';
  end if;
  insert into public.chat_wallpaper_preferences(
    conversation_id, user_id, wallpaper_style, wallpaper_image_path, updated_at
  ) values (
    target_conversation, viewer, target_wallpaper, null, now()
  ) on conflict (conversation_id, user_id) do update set
    wallpaper_style = excluded.wallpaper_style,
    wallpaper_image_path = null,
    updated_at = now()
  returning * into result;
  return result;
end;
$$;

revoke all on function public.set_my_chat_wallpaper(uuid, text) from public, anon;
grant execute on function public.set_my_chat_wallpaper(uuid, text) to authenticated;

create or replace function public.set_my_chat_wallpaper_image(
  target_conversation uuid,
  target_storage_path text
)
returns public.chat_wallpaper_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  result public.chat_wallpaper_preferences;
begin
  if viewer is null or not public.is_conversation_member(target_conversation) then
    raise exception 'Conversation access denied.';
  end if;
  if target_storage_path is null
    or split_part(target_storage_path, '/', 1) <> target_conversation::text
    or split_part(target_storage_path, '/', 2) <> viewer::text
    or not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'chat-media'
        and object.name = target_storage_path
        and object.owner_id = viewer::text
    ) then
    raise exception 'Wallpaper upload was not found for this conversation.';
  end if;
  insert into public.chat_wallpaper_preferences(
    conversation_id, user_id, wallpaper_style, wallpaper_image_path, updated_at
  ) values (
    target_conversation, viewer, 'paper', target_storage_path, now()
  ) on conflict (conversation_id, user_id) do update set
    wallpaper_style = 'paper',
    wallpaper_image_path = excluded.wallpaper_image_path,
    updated_at = now()
  returning * into result;
  return result;
end;
$$;

revoke all on function public.set_my_chat_wallpaper_image(uuid, text) from public, anon;
grant execute on function public.set_my_chat_wallpaper_image(uuid, text) to authenticated;

create or replace function private.can_read_chat_media_path(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_attachments attachment
    where attachment.storage_bucket = 'chat-media'
      and attachment.storage_path = object_name
      and attachment.status = 'finalized'
      and public.is_conversation_member(attachment.conversation_id)
  ) or exists (
    select 1 from public.chat_wallpaper_preferences preference
    where preference.wallpaper_image_path = object_name
      and preference.user_id = auth.uid()
      and public.is_conversation_member(preference.conversation_id)
  );
$$;

revoke all on function private.can_read_chat_media_path(text) from public;
grant execute on function private.can_read_chat_media_path(text) to authenticated;

update storage.buckets set file_size_limit = 104857600 where id = 'chat-media';
alter table public.chat_attachments drop constraint if exists chat_attachments_bytes_check;
alter table public.chat_attachments add constraint chat_attachments_bytes_check
  check (bytes between 1 and 104857600);

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
  if target_bytes not between 1 and 104857600 then
    raise exception 'Attachment must be 100 MiB or smaller.';
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
  if attachment_type is null then raise exception 'Unsupported attachment type.'; end if;
  select nullif((object.metadata ->> 'size')::integer, 0),
         nullif(object.metadata ->> 'mimetype', '')
  into storage_size, storage_mime
  from storage.objects object
  where object.bucket_id = 'chat-media'
    and object.name = target_storage_path
    and object.owner_id = viewer::text;
  if not found then raise exception 'Uploaded attachment was not found.'; end if;
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
  ) returning id into attachment_id;
  message_kind := case attachment_type
    when 'image' then 'image'::public.message_kind
    when 'video' then 'video'::public.message_kind
    else 'file'::public.message_kind
  end;
  insert into public.messages(conversation_id, sender_id, kind, body, payload, client_id)
  values (
    target_conversation, viewer, message_kind,
    case when attachment_type = 'document' then target_filename else attachment_type end,
    jsonb_strip_nulls(jsonb_build_object(
      'version', 1, 'attachment_id', attachment_id,
      'attachment_type', attachment_type, 'filename', target_filename,
      'mime_type', target_mime_type, 'bytes', target_bytes,
      'width', target_width, 'height', target_height,
      'duration_ms', target_duration_ms, 'source', target_source
    )), gen_random_uuid()
  ) returning * into inserted_message;
  update public.conversations set updated_at = inserted_message.created_at
  where id = target_conversation;
  return inserted_message;
end;
$$;

revoke all on function public.send_chat_attachment(uuid,text,text,text,integer,integer,integer,integer,text) from public, anon;
grant execute on function public.send_chat_attachment(uuid,text,text,text,integer,integer,integer,integer,text) to authenticated;
