alter table public.conversations
  drop constraint if exists conversations_storefront_id_fkey;

alter table public.conversations
  add constraint conversations_storefront_id_fkey
  foreign key (storefront_id)
  references public.storefronts(id)
  on delete cascade
  not valid;

alter table public.conversations
  validate constraint conversations_storefront_id_fkey;

notify pgrst, 'reload schema';
