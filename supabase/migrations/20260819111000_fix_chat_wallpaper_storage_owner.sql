-- storage.objects.owner_id is text, while auth.uid() is uuid. The initial
-- wallpaper RPC compared them directly, which rejected a valid uploaded image
-- before it could be linked to the member's conversation settings.

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
      select 1
      from storage.objects object
      where object.bucket_id = 'chat-media'
        and object.name = target_storage_path
        and object.owner_id = viewer::text
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
