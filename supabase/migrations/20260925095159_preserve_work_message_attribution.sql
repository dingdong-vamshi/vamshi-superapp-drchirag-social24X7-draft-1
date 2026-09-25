-- Business representatives are Auth identities without personal profiles.
-- Reference auth.users directly so their messages retain durable sender IDs.
alter table public.messages
  drop constraint messages_sender_id_fkey;

alter table public.messages
  add constraint messages_sender_id_fkey
  foreign key (sender_id) references auth.users(id);
