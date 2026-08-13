-- Commit new enum values before later migrations reference them in policies and RPCs.
alter type public.message_kind add value if not exists 'video';
alter type public.message_kind add value if not exists 'location';
alter type public.message_kind add value if not exists 'contact';
alter type public.message_kind add value if not exists 'poll';
alter type public.message_kind add value if not exists 'event';
