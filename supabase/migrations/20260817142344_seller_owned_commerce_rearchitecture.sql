-- Seller-owned commerce finalization.
-- Additive only: public Creator recommendations, seller-owned returns, and
-- server-issued evidence provenance intents.

create table if not exists public.commerce_evidence_capture_intents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  evidence_kind text not null check (evidence_kind in ('packing', 'unboxing')),
  evidence_source text not null check (evidence_source in ('live_capture', 'uploaded_file')),
  path_prefix text not null,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.commerce_evidence_capture_intents enable row level security;
revoke all on table public.commerce_evidence_capture_intents from public, anon, authenticated;
grant select on table public.commerce_evidence_capture_intents to authenticated;

drop policy if exists commerce_evidence_capture_intents_owner_read on public.commerce_evidence_capture_intents;
create policy commerce_evidence_capture_intents_owner_read
on public.commerce_evidence_capture_intents for select to authenticated
using (owner_id = (select auth.uid()));

create or replace function public.begin_commerce_evidence_capture(
  p_order_id uuid,
  p_order_item_id uuid,
  p_evidence_kind text,
  p_evidence_source text
)
returns table(intent_id uuid, path_prefix text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_order public.orders;
  v_intent public.commerce_evidence_capture_intents;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if p_evidence_kind not in ('packing', 'unboxing') then raise exception 'Unsupported evidence kind.'; end if;
  if p_evidence_source not in ('live_capture', 'uploaded_file') then raise exception 'Unsupported evidence source.'; end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found.'; end if;

  if p_evidence_kind = 'packing' then
    if not public.can_manage_storefront(v_order.storefront_id) then raise exception 'Seller access required.'; end if;
  else
    if v_order.customer_id <> v_user or v_order.status not in ('delivered','return_requested','return_approved','return_rejected') then
      raise exception 'Buyer evidence opens after delivery.';
    end if;
    if not exists (
      select 1 from public.order_items item
      where item.id = p_order_item_id and item.order_id = p_order_id and item.buyer_id = v_user
    ) then raise exception 'Order item not found.'; end if;
  end if;

  insert into public.commerce_evidence_capture_intents (
    owner_id, order_id, order_item_id, evidence_kind, evidence_source, path_prefix
  ) values (
    v_user,
    p_order_id,
    case when p_evidence_kind = 'packing' then null else p_order_item_id end,
    p_evidence_kind,
    p_evidence_source,
    v_user::text || '/orders/' || p_order_id::text || '/' || p_evidence_kind || '/' || gen_random_uuid()::text
  ) returning * into v_intent;

  return query select v_intent.id, v_intent.path_prefix, v_intent.expires_at;
end;
$$;

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
  select * into v_intent
  from public.commerce_evidence_capture_intents
  where id = p_intent_id and owner_id = v_user
  for update;
  if not found then raise exception 'Evidence capture intent not found.'; end if;
  if v_intent.consumed_at is not null or v_intent.expires_at < now() then raise exception 'Evidence capture intent expired.'; end if;
  if p_storage_path not like v_intent.path_prefix || '.%' then raise exception 'Evidence path does not match its server intent.'; end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'creator-commerce-private' and name = p_storage_path and owner = v_user
  ) then raise exception 'Uploaded evidence object not found.'; end if;

  insert into public.commerce_order_evidence (
    owner_id, order_id, order_item_id, evidence_kind, evidence_source,
    storage_path, file_name, mime_type, file_size
  ) values (
    v_user, v_intent.order_id, v_intent.order_item_id, v_intent.evidence_kind,
    v_intent.evidence_source, p_storage_path, nullif(trim(p_file_name), ''),
    nullif(trim(p_mime_type), ''), p_file_size
  ) returning * into v_evidence;

  update public.commerce_evidence_capture_intents set consumed_at = now() where id = v_intent.id;
  return v_evidence;
end;
$$;

revoke all on function public.begin_commerce_evidence_capture(uuid, uuid, text, text) from public;
revoke all on function public.finalize_commerce_evidence_capture(uuid, text, text, text, integer) from public;
grant execute on function public.begin_commerce_evidence_capture(uuid, uuid, text, text) to authenticated;
grant execute on function public.finalize_commerce_evidence_capture(uuid, text, text, text, integer) to authenticated;

drop policy if exists commerce_order_evidence_owner_insert on public.commerce_order_evidence;
revoke insert on public.commerce_order_evidence from authenticated;

drop policy if exists creator_commerce_private_order_participant_read on storage.objects;
create policy creator_commerce_private_order_participant_read
on storage.objects for select to authenticated
using (
  bucket_id = 'creator-commerce-private'
  and exists (
    select 1
    from public.commerce_order_evidence evidence
    join public.orders commerce_order on commerce_order.id = evidence.order_id
    where evidence.storage_path = storage.objects.name
      and (
        commerce_order.customer_id = (select auth.uid())
        or public.can_manage_storefront(commerce_order.storefront_id)
        or (select private.is_creator_commerce_admin())
      )
  )
);

create or replace function public.seller_review_creator_commerce_return(
  p_return_request_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.return_requests
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_return public.return_requests;
  v_item public.order_items;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if p_decision not in ('approved', 'rejected', 'under_review') then
    raise exception 'Return decision must be approved, rejected, or under_review.';
  end if;

  select * into v_return from public.return_requests where id = p_return_request_id for update;
  if not found then raise exception 'Return request not found.'; end if;
  if not public.can_manage_storefront(v_return.storefront_id) then raise exception 'Seller access required.'; end if;
  if v_return.status not in ('submitted', 'under_review') then raise exception 'Return request is already decided.'; end if;

  update public.return_requests
  set status = p_decision,
      admin_note = nullif(trim(coalesce(p_reason, '')), ''),
      reviewed_by = v_user,
      reviewed_at = case when p_decision = 'under_review' then null else now() end
  where id = p_return_request_id
  returning * into v_return;

  if p_decision = 'under_review' then return v_return; end if;
  select * into v_item from public.order_items where id = v_return.order_item_id;

  if p_decision = 'approved' then
    insert into public.refund_requests (
      return_request_id, checkout_group_id, order_id, buyer_id, amount_minor, status,
      provider
    ) values (
      v_return.id, v_item.checkout_group_id, v_item.order_id, v_item.buyer_id,
      v_item.subtotal_minor, 'external_integration_pending', 'external_pending'
    ) on conflict do nothing;
    update public.order_items set commission_status = 'reversed' where id = v_item.id;
    update public.creator_commissions
    set status = 'reversed', reversal_reason = coalesce(nullif(trim(p_reason), ''), 'Seller approved return'), updated_at = now()
    where order_item_id = v_item.id;
    update public.orders set status = 'return_approved', updated_at = now() where id = v_item.order_id;
  else
    update public.order_items
    set commission_status = case when commission_minor > 0 then 'confirmed' else 'none' end
    where id = v_item.id;
    update public.creator_commissions set status = 'confirmed', updated_at = now()
    where order_item_id = v_item.id and status = 'withheld';
    update public.orders set status = 'return_rejected', updated_at = now() where id = v_item.order_id;
  end if;

  return v_return;
end;
$$;

revoke all on function public.seller_review_creator_commerce_return(uuid, text, text) from public;
grant execute on function public.seller_review_creator_commerce_return(uuid, text, text) to authenticated;

create or replace function public.get_public_creator_recommendations(target_creator uuid)
returns table(
  promotion_id uuid,
  tracking_code text,
  product_id uuid,
  product_title text,
  product_slug text,
  storefront_name text,
  storefront_slug text,
  price_minor integer,
  cover_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    promotion.id,
    promotion.tracking_code,
    product.id,
    product.title,
    product.slug,
    storefront.name,
    storefront.slug,
    coalesce(product.sale_price_minor, product.price_minor),
    product.cover_path
  from public.creator_product_promotions promotion
  join public.products product on product.id = promotion.product_id
  join public.storefronts storefront on storefront.id = product.storefront_id
  where promotion.creator_id = target_creator
    and promotion.status = 'active'
    and product.status = 'active'
    and product.product_approval_status = 'approved'
    and product.inventory > 0
    and product.creator_promotion_enabled
    and storefront.active
  order by promotion.updated_at desc
  limit 50;
$$;

revoke all on function public.get_public_creator_recommendations(uuid) from public;
grant execute on function public.get_public_creator_recommendations(uuid) to anon, authenticated;

comment on function public.get_public_creator_recommendations(uuid) is
  'Public Creator profile recommendations. Returns only active, purchasable, Creator-enabled Products.';
