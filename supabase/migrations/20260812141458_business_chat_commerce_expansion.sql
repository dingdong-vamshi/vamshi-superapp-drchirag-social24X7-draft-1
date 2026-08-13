-- Batch A: make the storefront/customer pair the authoritative identity for
-- Business Chat while preserving every existing conversation and message.

alter table public.conversations
  add column if not exists business_customer_id uuid references public.profiles(id);

update public.conversations
set business_customer_id = created_by
where kind = 'business'
  and business_customer_id is null;

alter table public.conversations
  drop constraint if exists conversations_business_identity_check;

alter table public.conversations
  add constraint conversations_business_identity_check
  check (
    (kind = 'business' and storefront_id is not null and business_customer_id is not null)
    or
    (kind <> 'business' and business_customer_id is null)
  ) not valid;

alter table public.conversations
  validate constraint conversations_business_identity_check;

create unique index if not exists conversations_business_storefront_customer_key
  on public.conversations (storefront_id, business_customer_id)
  where kind = 'business';

create index if not exists conversations_business_customer_idx
  on public.conversations (business_customer_id, updated_at desc)
  where kind = 'business';

create or replace function public.open_business_conversation(target_storefront uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  storefront_owner_id uuid;
  existing_conversation_id uuid;
  created_conversation_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select storefront.owner_id
  into storefront_owner_id
  from public.storefronts storefront
  where storefront.id = target_storefront
    and storefront.active = true
    and storefront.verification_status = 'approved'
    and exists (
      select 1
      from public.creator_commerce_access access
      where access.user_id = storefront.owner_id
        and access.seller_status = 'approved'
    );

  if storefront_owner_id is null then
    raise exception 'Storefront is unavailable.';
  end if;

  if storefront_owner_id = current_user_id then
    raise exception 'Use Seller Studio to manage customer conversations.';
  end if;

  select conversation.id
  into existing_conversation_id
  from public.conversations conversation
  where conversation.kind = 'business'
    and conversation.storefront_id = target_storefront
    and conversation.business_customer_id = current_user_id
  limit 1;

  if existing_conversation_id is not null then
    insert into public.conversation_participants (conversation_id, user_id)
    values
      (existing_conversation_id, current_user_id),
      (existing_conversation_id, storefront_owner_id)
    on conflict do nothing;
    return existing_conversation_id;
  end if;

  insert into public.conversations (
    kind,
    storefront_id,
    business_customer_id,
    created_by
  ) values (
    'business',
    target_storefront,
    current_user_id,
    current_user_id
  )
  on conflict (storefront_id, business_customer_id) where kind = 'business'
  do update set updated_at = public.conversations.updated_at
  returning id into created_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (created_conversation_id, current_user_id),
    (created_conversation_id, storefront_owner_id)
  on conflict do nothing;

  return created_conversation_id;
end;
$$;

revoke all on function public.open_business_conversation(uuid) from public;
grant execute on function public.open_business_conversation(uuid) to authenticated;

-- Clients may send ordinary user content, but authoritative commerce/system
-- messages are inserted only by trusted commerce functions added in Batch C.
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
    'file'::public.message_kind,
    'voice'::public.message_kind,
    'product'::public.message_kind,
    'cart'::public.message_kind
  )
);

create or replace function public.send_personal_message(
  target_conversation uuid,
  message_body text,
  message_kind text default 'text',
  message_payload jsonb default '{}'::jsonb,
  message_client_id uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  inserted public.messages;
  safe_kind public.message_kind;
begin
  if viewer is null then
    raise exception 'Authentication required.';
  end if;

  if target_conversation is null
    or not public.is_conversation_member(target_conversation) then
    raise exception 'You are not a participant in this conversation.';
  end if;

  if nullif(btrim(coalesce(message_body, '')), '') is null then
    raise exception 'Message cannot be empty.';
  end if;

  safe_kind := case
    when message_kind in ('text', 'image', 'file', 'voice', 'product', 'cart')
      then message_kind::public.message_kind
    else 'text'::public.message_kind
  end;

  insert into public.messages (
    conversation_id,
    sender_id,
    kind,
    body,
    payload,
    client_id
  ) values (
    target_conversation,
    viewer,
    safe_kind,
    btrim(message_body),
    coalesce(message_payload, '{}'::jsonb),
    coalesce(message_client_id, gen_random_uuid())
  )
  returning * into inserted;

  update public.conversations
  set updated_at = inserted.created_at
  where id = target_conversation;

  return inserted;
end;
$$;

revoke all on function public.send_personal_message(uuid, text, text, jsonb, uuid) from public;
grant execute on function public.send_personal_message(uuid, text, text, jsonb, uuid) to authenticated;
