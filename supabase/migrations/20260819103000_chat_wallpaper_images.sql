-- Optional private image wallpaper for an existing conversation. The image is
-- still stored in the existing participant-scoped chat-media bucket; only
-- conversation members can read a selected wallpaper path.

alter table public.chat_conversation_settings
  add column if not exists wallpaper_image_path text;

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
  ) or exists (
    select 1
    from public.chat_conversation_settings settings
    where settings.wallpaper_image_path = object_name
      and public.is_conversation_member(settings.conversation_id)
  );
$$;

revoke all on function private.can_read_chat_media_path(text) from public;
grant execute on function private.can_read_chat_media_path(text) to authenticated;

create or replace function public.set_chat_wallpaper_image(
  target_conversation uuid,
  target_storage_path text
)
returns public.chat_conversation_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  result public.chat_conversation_settings;
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
        and object.owner_id = viewer
    ) then
    raise exception 'Wallpaper upload was not found for this conversation.';
  end if;

  insert into public.chat_conversation_settings(conversation_id, wallpaper_style, wallpaper_image_path, updated_by)
  values(target_conversation, 'paper', target_storage_path, viewer)
  on conflict(conversation_id) do update set
    wallpaper_style = 'paper',
    wallpaper_image_path = excluded.wallpaper_image_path,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into result;
  return result;
end;
$$;

revoke all on function public.set_chat_wallpaper_image(uuid, text) from public, anon;
grant execute on function public.set_chat_wallpaper_image(uuid, text) to authenticated;
