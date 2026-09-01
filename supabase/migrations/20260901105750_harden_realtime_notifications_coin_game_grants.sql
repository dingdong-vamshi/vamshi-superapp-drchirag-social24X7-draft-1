-- Tighten the default Data API grants on objects introduced by the realtime
-- notifications and mined-coin games migration. RLS remains the row-level
-- boundary, while these grants limit each role to the operations the client
-- actually uses.

revoke all on table public.game_coin_config from anon, authenticated;
revoke all on table public.game_coin_sessions from anon, authenticated;
revoke all on table public.social_notifications from anon, authenticated;

grant select on table public.game_coin_config to authenticated;
grant select on table public.game_coin_sessions to authenticated;
grant select, update on table public.social_notifications to authenticated;

revoke all on function public.get_my_spendable_mined_coins() from public, anon, authenticated;
revoke all on function public.start_quick_game_with_mined_coins(text, uuid) from public, anon, authenticated;
revoke all on function public.complete_quick_game(uuid) from public, anon, authenticated;

grant execute on function public.get_my_spendable_mined_coins() to authenticated;
grant execute on function public.start_quick_game_with_mined_coins(text, uuid) to authenticated;
grant execute on function public.complete_quick_game(uuid) to authenticated;
