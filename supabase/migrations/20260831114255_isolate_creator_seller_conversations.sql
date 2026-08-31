-- Creator/Seller commerce chat is a distinct conversation namespace. Buyer
-- Business Chat remains authoritative for orders and storefront support.
begin;

alter table public.conversations
  add column if not exists business_context text;

update public.conversations
set business_context = 'buyer_seller'
where kind = 'business'
  and business_context is null;

-- The former pair-only identity prevents a buyer and creator thread from
-- coexisting for the same dual-role account.
drop index if exists public.conversations_business_storefront_customer_key;

-- Existing QA creator threads were tagged in message payloads. A thread with
-- no order event is wholly Creator/Seller and can retain its id and history.
update public.conversations conversation
set business_context = 'creator_seller'
where conversation.kind = 'business'
  and exists (
    select 1 from public.messages message
    where message.conversation_id = conversation.id
      and message.payload ->> 'commerce_channel' = 'creator_seller'
  )
  and not exists (
    select 1 from public.commerce_order_chat_events event
    where event.conversation_id = conversation.id
  );

-- If historical QA data contains both an order event and explicitly tagged
-- creator messages, preserve the Buyer thread and move only the tagged
-- creator messages into a new private conversation with the same members.
do $migration$
declare
  source_conversation record;
  creator_conversation_id uuid;
begin
  for source_conversation in
    select conversation.*
    from public.conversations conversation
    where conversation.kind = 'business'
      and conversation.business_context = 'buyer_seller'
      and exists (
        select 1 from public.messages message
        where message.conversation_id = conversation.id
          and message.payload ->> 'commerce_channel' = 'creator_seller'
      )
      and exists (
        select 1 from public.commerce_order_chat_events event
        where event.conversation_id = conversation.id
      )
  loop
    insert into public.conversations (
      kind,
      storefront_id,
      business_customer_id,
      business_context,
      created_by,
      created_at,
      updated_at,
      title,
      image_path
    )
    select
      'business',
      source_conversation.storefront_id,
      source_conversation.business_customer_id,
      'creator_seller',
      source_conversation.created_by,
      min(message.created_at),
      max(message.created_at),
      source_conversation.title,
      source_conversation.image_path
    from public.messages message
    where message.conversation_id = source_conversation.id
      and message.payload ->> 'commerce_channel' = 'creator_seller'
    returning id into creator_conversation_id;

    insert into public.conversation_participants (
      conversation_id,
      user_id,
      joined_at,
      last_read_at,
      muted,
      archived_at,
      manually_unread_at,
      pinned_at,
      cleared_at,
      member_role
    )
    select
      creator_conversation_id,
      participant.user_id,
      participant.joined_at,
      participant.last_read_at,
      participant.muted,
      participant.archived_at,
      participant.manually_unread_at,
      participant.pinned_at,
      participant.cleared_at,
      participant.member_role
    from public.conversation_participants participant
    where participant.conversation_id = source_conversation.id
    on conflict do nothing;

    update public.messages message
    set conversation_id = creator_conversation_id
    where message.conversation_id = source_conversation.id
      and message.payload ->> 'commerce_channel' = 'creator_seller';

    update public.chat_attachments attachment
    set conversation_id = creator_conversation_id
    where attachment.conversation_id = source_conversation.id
      and exists (
        select 1
        from public.messages message
        where message.conversation_id = creator_conversation_id
          and message.payload ->> 'attachment_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          and (message.payload ->> 'attachment_id')::uuid = attachment.id
      );

    update public.conversations
    set updated_at = coalesce((
      select max(message.created_at)
      from public.messages message
      where message.conversation_id = source_conversation.id
    ), source_conversation.created_at)
    where id = source_conversation.id;
  end loop;
end
$migration$;

alter table public.conversations
  drop constraint if exists conversations_business_context_check;
alter table public.conversations
  add constraint conversations_business_context_check check (
    (kind = 'business' and business_context in ('buyer_seller', 'creator_seller'))
    or (kind <> 'business' and business_context is null)
  ) not valid;
alter table public.conversations
  validate constraint conversations_business_context_check;

create unique index conversations_business_context_identity_key
  on public.conversations (storefront_id, business_customer_id, business_context)
  where kind = 'business';

create index conversations_creator_seller_updated_idx
  on public.conversations (updated_at desc)
  where kind = 'business' and business_context = 'creator_seller';

create or replace function public.open_business_conversation(target_storefront uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
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
    and conversation.business_context = 'buyer_seller'
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
    business_context,
    created_by
  ) values (
    'business',
    target_storefront,
    current_user_id,
    'buyer_seller',
    current_user_id
  )
  on conflict (storefront_id, business_customer_id, business_context) where kind = 'business'
  do update set updated_at = public.conversations.updated_at
  returning id into created_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (created_conversation_id, current_user_id),
    (created_conversation_id, storefront_owner_id)
  on conflict do nothing;

  return created_conversation_id;
end;
$function$;

revoke all on function public.open_business_conversation(uuid) from public, anon;
grant execute on function public.open_business_conversation(uuid) to authenticated;

create or replace function private.ensure_order_business_conversation(target_order uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  order_row record;
  conversation_id uuid;
begin
  select
    commerce_order.customer_id,
    commerce_order.storefront_id,
    storefront.owner_id as seller_id
  into order_row
  from public.orders commerce_order
  join public.storefronts storefront on storefront.id = commerce_order.storefront_id
  where commerce_order.id = target_order;

  if not found then
    raise exception 'Order not found.';
  end if;

  insert into public.conversations (
    kind,
    storefront_id,
    business_customer_id,
    business_context,
    created_by
  ) values (
    'business',
    order_row.storefront_id,
    order_row.customer_id,
    'buyer_seller',
    order_row.customer_id
  )
  on conflict (storefront_id, business_customer_id, business_context) where kind = 'business'
  do update set updated_at = public.conversations.updated_at
  returning id into conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (conversation_id, order_row.customer_id),
    (conversation_id, order_row.seller_id)
  on conflict do nothing;

  return conversation_id;
end;
$function$;

revoke all on function private.ensure_order_business_conversation(uuid) from public, anon, authenticated;

create or replace function public.open_creator_seller_conversation(
  target_user uuid,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  viewer uuid := auth.uid();
  conversation_storefront uuid;
  customer_id uuid;
  seller_id uuid;
  conversation_id uuid;
begin
  if viewer is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if target_user is null or target_user = viewer then
    raise exception 'Choose another approved account.' using errcode = '22023';
  end if;

  if p_role = 'seller' then
    if not exists (
      select 1
      from public.creator_commerce_access access
      join auth.users auth_identity on auth_identity.id = access.user_id
      where access.user_id = viewer
        and access.creator_status = 'approved'
        and auth_identity.deleted_at is null
        and (auth_identity.banned_until is null or auth_identity.banned_until <= now())
        and coalesce(auth_identity.is_anonymous, false) = false
    ) then
      raise exception 'Approved Creator access required.' using errcode = '42501';
    end if;

    select storefront.id, storefront.owner_id
    into conversation_storefront, seller_id
    from public.storefronts storefront
    join public.creator_commerce_access access on access.user_id = storefront.owner_id
    join auth.users auth_identity on auth_identity.id = storefront.owner_id
    where storefront.owner_id = target_user
      and storefront.active = true
      and storefront.verification_status = 'approved'
      and access.seller_status = 'approved'
      and auth_identity.deleted_at is null
      and (auth_identity.banned_until is null or auth_identity.banned_until <= now())
      and coalesce(auth_identity.is_anonymous, false) = false
    order by storefront.created_at, storefront.id
    limit 1;
    customer_id := viewer;
  elsif p_role = 'creator' then
    if not exists (
      select 1
      from public.creator_commerce_access access
      join public.storefronts storefront on storefront.owner_id = access.user_id
      join auth.users auth_identity on auth_identity.id = access.user_id
      where access.user_id = viewer
        and access.seller_status = 'approved'
        and storefront.active = true
        and storefront.verification_status = 'approved'
        and auth_identity.deleted_at is null
        and (auth_identity.banned_until is null or auth_identity.banned_until <= now())
        and coalesce(auth_identity.is_anonymous, false) = false
    ) then
      raise exception 'Approved Seller access required.' using errcode = '42501';
    end if;

    if not exists (
      select 1
      from public.creator_commerce_access access
      join auth.users auth_identity on auth_identity.id = access.user_id
      where access.user_id = target_user
        and access.creator_status = 'approved'
        and auth_identity.deleted_at is null
        and (auth_identity.banned_until is null or auth_identity.banned_until <= now())
        and coalesce(auth_identity.is_anonymous, false) = false
    ) then
      raise exception 'Creator is unavailable.' using errcode = '42501';
    end if;

    select storefront.id
    into conversation_storefront
    from public.storefronts storefront
    where storefront.owner_id = viewer
      and storefront.active = true
      and storefront.verification_status = 'approved'
    order by storefront.created_at, storefront.id
    limit 1;
    seller_id := viewer;
    customer_id := target_user;
  else
    raise exception 'Unsupported counterpart role.' using errcode = '22023';
  end if;

  if conversation_storefront is null or seller_id is null then
    raise exception 'Approved Seller storefront is unavailable.' using errcode = '42501';
  end if;

  insert into public.conversations (
    kind,
    storefront_id,
    business_customer_id,
    business_context,
    created_by
  ) values (
    'business',
    conversation_storefront,
    customer_id,
    'creator_seller',
    viewer
  )
  on conflict (storefront_id, business_customer_id, business_context) where kind = 'business'
  do update set updated_at = public.conversations.updated_at
  returning id into conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values (conversation_id, customer_id), (conversation_id, seller_id)
  on conflict do nothing;

  return conversation_id;
end;
$function$;

revoke all on function public.open_creator_seller_conversation(uuid, text) from public, anon, authenticated;
grant execute on function public.open_creator_seller_conversation(uuid, text) to authenticated;

comment on column public.conversations.business_context is
  'Authoritative business conversation namespace: buyer_seller order/support or creator_seller promotion collaboration.';
comment on function public.open_creator_seller_conversation(uuid, text) is
  'Creates or reuses the isolated Creator/Seller commerce conversation for an approved counterparty.';

notify pgrst, 'reload schema';

commit;
