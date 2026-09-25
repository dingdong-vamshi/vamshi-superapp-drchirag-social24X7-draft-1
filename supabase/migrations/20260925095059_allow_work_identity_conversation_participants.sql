-- Conversation membership is an authorization/read-state relation, not a
-- personal-profile relation. Work-only Auth identities intentionally have no
-- profiles row, so the foreign key must target the identity table.
alter table public.conversation_participants
  drop constraint conversation_participants_user_id_fkey;

alter table public.conversation_participants
  add constraint conversation_participants_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
