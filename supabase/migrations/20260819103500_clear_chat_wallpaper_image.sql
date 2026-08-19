-- A colour selection replaces any prior image wallpaper for that conversation.

create or replace function public.set_chat_wallpaper(target_conversation uuid, target_wallpaper text)
returns public.chat_conversation_settings
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid := auth.uid(); result public.chat_conversation_settings;
begin
  if viewer is null or not public.is_conversation_member(target_conversation) then
    raise exception 'Conversation access denied.';
  end if;
  if target_wallpaper not in ('neutral', 'sky', 'forest', 'warm', 'paper') then
    raise exception 'Unsupported chat wallpaper.';
  end if;
  insert into public.chat_conversation_settings(conversation_id, wallpaper_style, wallpaper_image_path, updated_by)
  values(target_conversation, target_wallpaper, null, viewer)
  on conflict(conversation_id) do update set
    wallpaper_style = excluded.wallpaper_style,
    wallpaper_image_path = null,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into result;
  return result;
end;
$$;

revoke all on function public.set_chat_wallpaper(uuid, text) from public, anon;
grant execute on function public.set_chat_wallpaper(uuid, text) to authenticated;
