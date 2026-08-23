-- Complete the Buyer -> Seller return workflow without replacing the existing
-- provider-neutral order/refund lifecycle. Return media stays in the existing
-- private commerce bucket and is linked to the authoritative return request.

alter table public.return_requests
  add column if not exists details text;

create unique index if not exists return_requests_order_item_unique
  on public.return_requests (order_item_id);

alter table public.commerce_order_evidence
  add column if not exists return_request_id uuid
    references public.return_requests(id) on delete cascade,
  add column if not exists captured_at timestamptz;

alter table public.commerce_evidence_capture_intents
  add column if not exists return_request_id uuid
    references public.return_requests(id) on delete cascade;

alter table public.commerce_order_evidence
  drop constraint if exists commerce_order_evidence_kind_check;
alter table public.commerce_order_evidence
  add constraint commerce_order_evidence_kind_check
  check (evidence_kind in (
    'packing', 'handoff', 'delivery', 'unboxing', 'return',
    'return_pickup', 'return_received'
  ));

alter table public.commerce_evidence_capture_intents
  drop constraint if exists commerce_evidence_capture_intents_evidence_kind_check;
alter table public.commerce_evidence_capture_intents
  add constraint commerce_evidence_capture_intents_evidence_kind_check
  check (evidence_kind in ('packing', 'unboxing', 'return'));

create index if not exists commerce_order_evidence_return_request_idx
  on public.commerce_order_evidence (return_request_id, created_at desc)
  where return_request_id is not null;

comment on column public.commerce_order_evidence.captured_at is
  'Server-issued capture-intent time. Present only for trusted in-app live capture.';

-- iOS commonly supplies camera/gallery video as QuickTime. Keep the bucket
-- private while allowing the same video formats as private chat media.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm',
  'application/pdf'
]::text[]
where id = 'creator-commerce-private';

create or replace function private.create_commerce_evidence_capture_intent(
  p_owner_id uuid,
  p_order_id uuid,
  p_order_item_id uuid,
  p_evidence_kind text,
  p_return_request_id uuid,
  p_evidence_source text
)
returns table(intent_id uuid, path_prefix text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_order public.orders;
  v_return public.return_requests;
  v_intent public.commerce_evidence_capture_intents;
begin
  if p_owner_id is null then raise exception 'Authentication required.'; end if;
  if p_evidence_kind not in ('packing', 'unboxing', 'return') then
    raise exception 'Unsupported evidence kind.';
  end if;
  if p_evidence_source not in ('live_capture', 'uploaded_file') then
    raise exception 'Unsupported evidence source.';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found.'; end if;

  if p_evidence_kind = 'packing' then
    if p_return_request_id is not null or p_order_item_id is not null then
      raise exception 'Packing evidence must target the order.';
    end if;
    if not public.can_manage_storefront(v_order.storefront_id) then
      raise exception 'Seller access required.';
    end if;
  elsif p_evidence_kind = 'unboxing' then
    if p_return_request_id is not null then
      raise exception 'Unboxing evidence cannot target a return.';
    end if;
    if v_order.customer_id <> p_owner_id
       or v_order.status not in ('delivered', 'return_requested', 'return_approved', 'return_rejected') then
      raise exception 'Buyer evidence opens after delivery.';
    end if;
    if not exists (
      select 1 from public.order_items item
      where item.id = p_order_item_id
        and item.order_id = p_order_id
        and item.buyer_id = p_owner_id
    ) then raise exception 'Order item not found.'; end if;
  else
    select * into v_return
    from public.return_requests
    where id = p_return_request_id
      and order_id = p_order_id
      and order_item_id = p_order_item_id
      and buyer_id = p_owner_id
      and status in ('submitted', 'under_review');
    if not found then
      raise exception 'Open buyer return not found.';
    end if;
  end if;

  insert into public.commerce_evidence_capture_intents (
    owner_id, order_id, order_item_id, evidence_kind, evidence_source,
    return_request_id, path_prefix
  ) values (
    p_owner_id,
    p_order_id,
    case when p_evidence_kind = 'packing' then null else p_order_item_id end,
    p_evidence_kind,
    p_evidence_source,
    case when p_evidence_kind = 'return' then p_return_request_id else null end,
    p_owner_id::text || '/orders/' || p_order_id::text || '/' ||
      p_evidence_kind || '/' || coalesce(p_return_request_id::text, gen_random_uuid()::text) ||
      '/' || gen_random_uuid()::text
  ) returning * into v_intent;

  return query select v_intent.id, v_intent.path_prefix, v_intent.expires_at;
end;
$$;

revoke all on function private.create_commerce_evidence_capture_intent(uuid, uuid, uuid, text, uuid, text)
  from public, anon, authenticated;

create or replace function public.begin_trusted_commerce_evidence_capture(
  p_order_id uuid,
  p_order_item_id uuid,
  p_evidence_kind text,
  p_return_request_id uuid default null
)
returns table(intent_id uuid, path_prefix text, expires_at timestamptz)
language sql
security definer
set search_path = public, private
as $$
  select * from private.create_commerce_evidence_capture_intent(
    auth.uid(), p_order_id, p_order_item_id, p_evidence_kind,
    p_return_request_id, 'live_capture'
  );
$$;

create or replace function public.begin_uploaded_commerce_evidence_capture(
  p_order_id uuid,
  p_order_item_id uuid,
  p_evidence_kind text,
  p_return_request_id uuid default null
)
returns table(intent_id uuid, path_prefix text, expires_at timestamptz)
language sql
security definer
set search_path = public, private
as $$
  select * from private.create_commerce_evidence_capture_intent(
    auth.uid(), p_order_id, p_order_item_id, p_evidence_kind,
    p_return_request_id, 'uploaded_file'
  );
$$;

revoke all on function public.begin_trusted_commerce_evidence_capture(uuid, uuid, text, uuid)
  from public, anon;
revoke all on function public.begin_uploaded_commerce_evidence_capture(uuid, uuid, text, uuid)
  from public, anon;
grant execute on function public.begin_trusted_commerce_evidence_capture(uuid, uuid, text, uuid)
  to authenticated;
grant execute on function public.begin_uploaded_commerce_evidence_capture(uuid, uuid, text, uuid)
  to authenticated;

-- Retire the client-selected provenance endpoint. Callers now choose one of
-- two server-fixed capture contexts and cannot submit an evidence_source value.
revoke execute on function public.begin_commerce_evidence_capture(uuid, uuid, text, text)
  from authenticated, anon;

create or replace function public.finalize_commerce_evidence_capture(
  p_intent_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size integer
)
returns public.commerce_order_evidence
language plpgsql
security definer
set search_path = public, private, storage
as $$
declare
  v_user uuid := auth.uid();
  v_intent public.commerce_evidence_capture_intents;
  v_evidence public.commerce_order_evidence;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select * into v_intent
  from public.commerce_evidence_capture_intents
  where id = p_intent_id and owner_id = v_user
  for update;
  if not found then raise exception 'Evidence capture intent not found.'; end if;
  if v_intent.consumed_at is not null or v_intent.expires_at < now() then
    raise exception 'Evidence capture intent expired.';
  end if;
  if p_storage_path not like v_intent.path_prefix || '.%' then
    raise exception 'Evidence path does not match its server intent.';
  end if;
  if p_file_size not between 1 and 15728640 then
    raise exception 'Evidence must be 15 MiB or smaller.';
  end if;
  if p_mime_type not in (
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/webm'
  ) then raise exception 'Unsupported evidence media type.'; end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'creator-commerce-private'
      and name = p_storage_path
      and owner_id = v_user::text
  ) then raise exception 'Uploaded evidence object not found.'; end if;

  insert into public.commerce_order_evidence (
    owner_id, order_id, order_item_id, return_request_id,
    evidence_kind, evidence_source, captured_at,
    storage_path, file_name, mime_type, file_size
  ) values (
    v_user, v_intent.order_id, v_intent.order_item_id, v_intent.return_request_id,
    v_intent.evidence_kind, v_intent.evidence_source,
    case when v_intent.evidence_source = 'live_capture' then v_intent.created_at else null end,
    p_storage_path, nullif(trim(p_file_name), ''),
    nullif(trim(p_mime_type), ''), p_file_size
  ) returning * into v_evidence;

  update public.commerce_evidence_capture_intents
  set consumed_at = now()
  where id = v_intent.id;
  return v_evidence;
end;
$$;

revoke all on function public.finalize_commerce_evidence_capture(uuid, text, text, text, integer)
  from public, anon;
grant execute on function public.finalize_commerce_evidence_capture(uuid, text, text, text, integer)
  to authenticated;

drop function if exists public.submit_creator_commerce_return(uuid, text);

create function public.submit_creator_commerce_return(
  p_order_item_id uuid,
  p_reason text,
  p_details text default null
)
returns public.return_requests
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_item record;
  v_return public.return_requests;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Return reason is required.';
  end if;

  select oi.*, o.status as order_status
  into v_item
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id and oi.buyer_id = v_user
  for update of oi, o;

  if not found then raise exception 'Order item not found.'; end if;
  if v_item.order_status not in ('delivered', 'return_requested', 'return_approved', 'return_rejected') then
    raise exception 'Returns open after delivery.';
  end if;
  if v_item.return_window_ends_at is not null and v_item.return_window_ends_at < now() then
    raise exception 'Return window has elapsed.';
  end if;

  insert into public.return_requests (
    order_item_id, order_id, buyer_id, seller_id, storefront_id, creator_id,
    reason, details
  ) values (
    v_item.id, v_item.order_id, v_user, v_item.seller_id, v_item.storefront_id,
    v_item.creator_id, trim(p_reason), nullif(trim(coalesce(p_details, '')), '')
  ) on conflict (order_item_id) do nothing
  returning * into v_return;

  if not found then raise exception 'A return already exists for this order item.'; end if;

  update public.orders set status = 'return_requested', updated_at = now()
  where id = v_item.order_id;
  update public.order_items set commission_status = 'withheld'
  where id = v_item.id and commission_status in ('pending', 'confirmed');
  update public.creator_commissions set status = 'withheld', updated_at = now()
  where order_item_id = v_item.id
    and status in ('pending', 'confirmed', 'eligible', 'payable');

  return v_return;
end;
$$;

revoke all on function public.submit_creator_commerce_return(uuid, text, text)
  from public, anon;
grant execute on function public.submit_creator_commerce_return(uuid, text, text)
  to authenticated;
