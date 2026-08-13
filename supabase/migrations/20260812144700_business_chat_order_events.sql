-- Batch C: append immutable, server-owned commerce events to the same
-- storefront/customer Business Chat used by ordinary messages.

create table if not exists public.commerce_order_chat_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  event_type text not null,
  order_status text not null,
  payload_version integer not null default 1,
  created_at timestamptz not null default now(),
  constraint commerce_order_chat_events_type_check check (
    event_type in (
      'order_confirmed',
      'order_processing',
      'order_shipped',
      'order_out_for_delivery',
      'order_delivered',
      'order_cancelled',
      'return_requested',
      'return_approved',
      'return_rejected',
      'order_refunded'
    )
  ),
  constraint commerce_order_chat_events_version_check check (payload_version = 1),
  unique (order_id, event_type),
  unique (message_id)
);

create index if not exists commerce_order_chat_events_conversation_idx
  on public.commerce_order_chat_events (conversation_id, created_at desc);

alter table public.commerce_order_chat_events enable row level security;

revoke all on table public.commerce_order_chat_events from public, anon, authenticated;
grant select on table public.commerce_order_chat_events to authenticated;

drop policy if exists commerce_order_chat_events_member_read on public.commerce_order_chat_events;
create policy commerce_order_chat_events_member_read
on public.commerce_order_chat_events
for select
to authenticated
using (public.is_conversation_member(conversation_id));

create or replace function private.ensure_order_business_conversation(target_order uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
    created_by
  ) values (
    'business',
    order_row.storefront_id,
    order_row.customer_id,
    order_row.customer_id
  )
  on conflict (storefront_id, business_customer_id) where kind = 'business'
  do update set updated_at = public.conversations.updated_at
  returning id into conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (conversation_id, order_row.customer_id),
    (conversation_id, order_row.seller_id)
  on conflict do nothing;

  return conversation_id;
end;
$$;

revoke all on function private.ensure_order_business_conversation(uuid) from public;

create or replace function private.emit_order_chat_event(
  target_order uuid,
  target_event_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row record;
  fulfillment_row public.order_fulfillments%rowtype;
  conversation_id uuid;
  inserted_message_id uuid;
  existing_message_id uuid;
  event_body text;
  item_payload jsonb;
  event_payload jsonb;
begin
  if target_event_type not in (
    'order_confirmed',
    'order_processing',
    'order_shipped',
    'order_out_for_delivery',
    'order_delivered',
    'order_cancelled',
    'return_requested',
    'return_approved',
    'return_rejected',
    'order_refunded'
  ) then
    raise exception 'Unsupported order chat event.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_order::text || ':' || target_event_type, 0));

  select event.message_id
  into existing_message_id
  from public.commerce_order_chat_events event
  where event.order_id = target_order
    and event.event_type = target_event_type;

  if existing_message_id is not null then
    return existing_message_id;
  end if;

  select
    commerce_order.id,
    commerce_order.customer_id,
    commerce_order.storefront_id,
    commerce_order.status,
    commerce_order.currency,
    commerce_order.subtotal_minor,
    commerce_order.total_minor,
    commerce_order.payment_method,
    commerce_order.payment_status,
    commerce_order.created_at,
    storefront.name as storefront_name,
    storefront.slug as storefront_slug
  into order_row
  from public.orders commerce_order
  join public.storefronts storefront on storefront.id = commerce_order.storefront_id
  where commerce_order.id = target_order;

  if not found then
    raise exception 'Order not found.';
  end if;

  select fulfillment.*
  into fulfillment_row
  from public.order_fulfillments fulfillment
  where fulfillment.order_id = target_order;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'order_item_id', item.id,
        'product_id', item.product_id,
        'title', item.product_title_snapshot,
        'slug', item.product_slug_snapshot,
        'quantity', item.quantity,
        'unit_price_minor', item.unit_price_minor,
        'subtotal_minor', item.subtotal_minor
      ) order by item.created_at
    ),
    '[]'::jsonb
  )
  into item_payload
  from public.order_items item
  where item.order_id = target_order;

  event_body := case target_event_type
    when 'order_confirmed' then 'Order confirmed'
    when 'order_processing' then 'Order is being processed'
    when 'order_shipped' then 'Order shipped'
    when 'order_out_for_delivery' then 'Order is out for delivery'
    when 'order_delivered' then 'Order delivered'
    when 'order_cancelled' then 'Order cancelled'
    when 'return_requested' then 'Return requested'
    when 'return_approved' then 'Return approved'
    when 'return_rejected' then 'Return rejected'
    when 'order_refunded' then 'Order refunded'
  end;

  conversation_id := private.ensure_order_business_conversation(target_order);
  event_payload := jsonb_strip_nulls(jsonb_build_object(
    'version', 1,
    'event_type', target_event_type,
    'order_id', order_row.id,
    'order_status', order_row.status,
    'storefront_id', order_row.storefront_id,
    'storefront_name', order_row.storefront_name,
    'storefront_slug', order_row.storefront_slug,
    'currency', order_row.currency,
    'subtotal_minor', order_row.subtotal_minor,
    'total_minor', order_row.total_minor,
    'payment_method', order_row.payment_method,
    'payment_status', order_row.payment_status,
    'placed_at', order_row.created_at,
    'items', item_payload,
    'carrier', nullif(fulfillment_row.carrier, ''),
    'tracking_number', nullif(fulfillment_row.tracking_number, ''),
    'package_reference', nullif(fulfillment_row.package_reference, ''),
    'customer_note', nullif(fulfillment_row.customer_note, '')
  ));

  insert into public.messages (
    conversation_id,
    sender_id,
    kind,
    body,
    payload,
    client_id
  ) values (
    conversation_id,
    null,
    'order'::public.message_kind,
    event_body,
    event_payload,
    gen_random_uuid()
  )
  returning id into inserted_message_id;

  insert into public.commerce_order_chat_events (
    order_id,
    conversation_id,
    message_id,
    event_type,
    order_status,
    payload_version
  ) values (
    target_order,
    conversation_id,
    inserted_message_id,
    target_event_type,
    order_row.status,
    1
  );

  update public.conversations
  set updated_at = now()
  where id = conversation_id;

  return inserted_message_id;
end;
$$;

revoke all on function private.emit_order_chat_event(uuid, text) from public;

create or replace function private.emit_order_event_from_order_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'placed' then
    perform private.emit_order_chat_event(new.order_id, 'order_confirmed');
  elsif new.status = 'processing' then
    perform private.emit_order_chat_event(new.order_id, 'order_processing');
  elsif new.status = 'shipped' then
    perform private.emit_order_chat_event(new.order_id, 'order_shipped');
  elsif new.status = 'out_for_delivery' then
    perform private.emit_order_chat_event(new.order_id, 'order_out_for_delivery');
  elsif new.status = 'delivered' then
    perform private.emit_order_chat_event(new.order_id, 'order_delivered');
  elsif new.status = 'cancelled' then
    perform private.emit_order_chat_event(new.order_id, 'order_cancelled');
  end if;
  return new;
end;
$$;

drop trigger if exists order_events_emit_business_chat on public.order_events;
create trigger order_events_emit_business_chat
after insert on public.order_events
for each row
execute function private.emit_order_event_from_order_history();

create or replace function private.emit_order_event_from_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'draft' and new.status = 'placed' then
    perform private.emit_order_chat_event(new.id, 'order_confirmed');
  elsif new.status = 'return_requested' and old.status is distinct from new.status then
    perform private.emit_order_chat_event(new.id, 'return_requested');
  elsif new.status = 'refunded' and old.status is distinct from new.status then
    perform private.emit_order_chat_event(new.id, 'order_refunded');
  end if;
  return new;
end;
$$;

drop trigger if exists orders_emit_business_chat on public.orders;
create trigger orders_emit_business_chat
after update of status on public.orders
for each row
execute function private.emit_order_event_from_status_change();

create or replace function private.emit_return_review_business_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and new.status = 'approved' then
    perform private.emit_order_chat_event(new.order_id, 'return_approved');
  elsif old.status is distinct from new.status and new.status = 'rejected' then
    perform private.emit_order_chat_event(new.order_id, 'return_rejected');
  end if;
  return new;
end;
$$;

drop trigger if exists return_reviews_emit_business_chat on public.return_requests;
create trigger return_reviews_emit_business_chat
after update of status on public.return_requests
for each row
execute function private.emit_return_review_business_chat();
