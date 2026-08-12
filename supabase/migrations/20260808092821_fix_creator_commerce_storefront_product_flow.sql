create or replace function private.provision_creator_commerce_storefront(p_owner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  application public.seller_applications%rowtype;
  storefront_id uuid;
  base_slug text;
  selected_slug text;
begin
  select seller.*
  into application
  from public.seller_applications seller
  where seller.owner_id = p_owner_id
    and seller.status = 'approved'
  order by seller.updated_at desc
  limit 1;

  if not found then
    raise exception 'Approved seller application required before storefront provisioning.';
  end if;

  select storefront.id
  into storefront_id
  from public.storefronts storefront
  where storefront.owner_id = p_owner_id
  order by storefront.updated_at desc
  limit 1;

  if storefront_id is not null then
    update public.storefronts
    set active = true,
        verification_status = 'approved',
        updated_at = now()
    where id = storefront_id;
    return storefront_id;
  end if;

  base_slug := trim(both '-' from regexp_replace(
    lower(coalesce(nullif(trim(application.storefront_name), ''), 'store')),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
  base_slug := coalesce(nullif(left(base_slug, 52), ''), 'store');
  selected_slug := base_slug;

  if exists (
    select 1
    from public.storefronts storefront
    where storefront.slug = selected_slug
      and storefront.owner_id <> p_owner_id
  ) then
    selected_slug := left(base_slug, 43) || '-' || left(p_owner_id::text, 8);
  end if;

  insert into public.storefronts (
    owner_id,
    name,
    slug,
    tagline,
    description,
    seller_tier,
    business_type,
    state_code,
    city,
    support_phone,
    support_email,
    primary_category,
    seo_title,
    seo_description,
    llm_summary,
    indexable,
    geo_enabled,
    active,
    verification_status
  ) values (
    p_owner_id,
    coalesce(nullif(trim(application.storefront_name), ''), 'Creator Commerce Store'),
    selected_slug,
    coalesce(nullif(trim(application.business_name), ''), 'Creator Commerce seller'),
    coalesce(nullif(trim(application.business_name), ''), nullif(trim(application.legal_name), ''), 'Creator Commerce storefront'),
    coalesce(nullif(trim(application.seller_tier), ''), case when application.seller_type = 'gst' then 'gst' else 'local' end),
    coalesce(nullif(trim(application.business_type), ''), 'independent'),
    coalesce(nullif(trim(application.state_code), ''), nullif(trim(application.registered_state), '')),
    nullif(trim(application.city), ''),
    nullif(trim(application.phone), ''),
    nullif(lower(trim(application.email)), ''),
    'Everyday',
    coalesce(nullif(trim(application.storefront_name), ''), 'Creator Commerce Store'),
    coalesce(nullif(trim(application.business_name), ''), 'Creator Commerce storefront'),
    coalesce(nullif(trim(application.business_name), ''), nullif(trim(application.legal_name), ''), 'Creator Commerce storefront'),
    true,
    true,
    true,
    'approved'
  )
  on conflict (owner_id) do update
  set active = true,
      verification_status = 'approved',
      updated_at = now()
  returning id into storefront_id;

  return storefront_id;
end;
$$;

revoke all on function private.provision_creator_commerce_storefront(uuid) from public;

create or replace function public.ensure_creator_commerce_storefront()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;
  return private.provision_creator_commerce_storefront(current_user_id);
end;
$$;

revoke all on function public.ensure_creator_commerce_storefront() from public;
grant execute on function public.ensure_creator_commerce_storefront() to authenticated;

create or replace function private.sync_creator_commerce_access_from_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'draft' then
    return new;
  end if;

  if tg_table_name = 'seller_applications' then
    update public.creator_commerce_access
    set seller_status = new.status,
        updated_at = now()
    where user_id = new.owner_id;

    if new.status = 'approved' then
      perform private.provision_creator_commerce_storefront(new.owner_id);
    elsif new.status = 'suspended' then
      update public.storefronts
      set active = false,
          updated_at = now()
      where owner_id = new.owner_id;
    end if;
  elsif tg_table_name = 'creator_applications' then
    update public.creator_commerce_access
    set creator_status = new.status,
        updated_at = now()
    where user_id = new.owner_id;
  elsif tg_table_name = 'professional_verification_requests' then
    update public.creator_commerce_access
    set professional_status = new.status,
        updated_at = now()
    where user_id = new.owner_id;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_creator_commerce_access_from_application() from public;

do $$
declare
  approved_seller record;
begin
  for approved_seller in
    select distinct seller.owner_id
    from public.seller_applications seller
    where seller.status = 'approved'
  loop
    perform private.provision_creator_commerce_storefront(approved_seller.owner_id);
  end loop;
end;
$$;

create or replace function public.save_creator_commerce_product(
  p_product_id uuid,
  p_title text,
  p_slug text,
  p_category text,
  p_price_minor integer,
  p_sale_price_minor integer,
  p_inventory integer,
  p_sku text,
  p_short_description text,
  p_description text,
  p_creator_promotion_enabled boolean,
  p_creator_commission_bps integer,
  p_return_window_days integer
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_storefront public.storefronts%rowtype;
  saved_product public.products%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.creator_commerce_access access
    where access.user_id = current_user_id
      and access.seller_status = 'approved'
  ) then
    raise exception 'Seller approval is required before saving products.';
  end if;

  select storefront.*
  into owned_storefront
  from public.storefronts storefront
  where storefront.owner_id = current_user_id
    and storefront.active = true
  order by storefront.updated_at desc
  limit 1;

  if not found then
    raise exception 'Approved seller storefront is missing. Ask Commerce Admin to repair seller approval.';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'Product title is required.';
  end if;
  if nullif(trim(coalesce(p_slug, '')), '') is null then
    raise exception 'Product slug is required.';
  end if;
  if p_price_minor < 0 or coalesce(p_sale_price_minor, 0) < 0 then
    raise exception 'Product prices cannot be negative.';
  end if;
  if coalesce(p_sale_price_minor, 0) > p_price_minor then
    raise exception 'Sale price cannot exceed the regular price.';
  end if;
  if p_inventory < 0 then
    raise exception 'Product inventory cannot be negative.';
  end if;
  if p_return_window_days not between 0 and 30 then
    raise exception 'Return window must be between 0 and 30 days.';
  end if;
  if p_creator_promotion_enabled and p_creator_commission_bps not between 500 and 7000 then
    raise exception 'Creator commission must be between 5%% and 70%%.';
  end if;

  if p_product_id is null then
    insert into public.products (
      storefront_id,
      title,
      slug,
      brand,
      category,
      price_minor,
      sale_price_minor,
      inventory,
      sku,
      short_description,
      description,
      creator_promotion_enabled,
      creator_commission_bps,
      return_window_days,
      status,
      product_approval_status,
      published_at
    ) values (
      owned_storefront.id,
      trim(p_title),
      trim(p_slug),
      owned_storefront.name,
      p_category,
      p_price_minor,
      case when coalesce(p_sale_price_minor, 0) > 0 then p_sale_price_minor else null end,
      p_inventory,
      trim(p_sku),
      left(trim(p_short_description), 180),
      trim(p_description),
      p_creator_promotion_enabled,
      case when p_creator_promotion_enabled then p_creator_commission_bps else 0 end,
      p_return_window_days,
      'draft',
      'draft',
      null
    )
    returning * into saved_product;
  else
    select product.*
    into saved_product
    from public.products product
    where product.id = p_product_id
      and product.storefront_id = owned_storefront.id
    for update;

    if not found then
      raise exception 'Product not found or seller access denied.';
    end if;

    if saved_product.product_approval_status not in ('draft', 'changes_required', 'rejected') then
      raise exception 'Only draft, changes-required, or rejected products can be edited.';
    end if;

    update public.products
    set title = trim(p_title),
        slug = trim(p_slug),
        brand = owned_storefront.name,
        category = p_category,
        price_minor = p_price_minor,
        sale_price_minor = case when coalesce(p_sale_price_minor, 0) > 0 then p_sale_price_minor else null end,
        inventory = p_inventory,
        sku = trim(p_sku),
        short_description = left(trim(p_short_description), 180),
        description = trim(p_description),
        creator_promotion_enabled = p_creator_promotion_enabled,
        creator_commission_bps = case when p_creator_promotion_enabled then p_creator_commission_bps else 0 end,
        return_window_days = p_return_window_days,
        status = 'draft',
        product_approval_status = 'draft',
        approval_requested_at = null,
        reviewed_by = null,
        reviewed_at = null,
        review_note = null,
        published_at = null,
        updated_at = now()
    where id = p_product_id
    returning * into saved_product;
  end if;

  return saved_product;
end;
$$;

revoke all on function public.save_creator_commerce_product(uuid, text, text, text, integer, integer, integer, text, text, text, boolean, integer, integer) from public;
grant execute on function public.save_creator_commerce_product(uuid, text, text, text, integer, integer, integer, text, text, text, boolean, integer, integer) to authenticated;

create or replace function public.submit_creator_commerce_product(p_product_id uuid)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  product public.products%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select candidate.*
  into product
  from public.products candidate
  join public.storefronts storefront on storefront.id = candidate.storefront_id
  where candidate.id = p_product_id
    and storefront.owner_id = current_user_id
  for update of candidate;

  if not found then
    raise exception 'Product not found or seller access denied.';
  end if;

  if not exists (
    select 1
    from public.creator_commerce_access access
    where access.user_id = current_user_id
      and access.seller_status = 'approved'
  ) then
    raise exception 'Seller approval is required before product submission.';
  end if;

  if product.product_approval_status not in ('draft', 'changes_required', 'rejected') then
    raise exception 'Only draft, changes-required, or rejected products can be submitted.';
  end if;

  update public.products
  set product_approval_status = 'submitted',
      approval_requested_at = now(),
      reviewed_by = null,
      reviewed_at = null,
      review_note = null,
      status = 'draft',
      published_at = null,
      updated_at = now()
  where id = p_product_id
  returning * into product;

  return product;
end;
$$;

revoke all on function public.submit_creator_commerce_product(uuid) from public;
grant execute on function public.submit_creator_commerce_product(uuid) to authenticated;

create or replace function public.review_creator_commerce_product(
  p_product_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  product public.products%rowtype;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if current_user_id is null or not (select private.is_creator_commerce_admin()) then
    raise exception 'Commerce admin access required.';
  end if;

  if p_decision not in ('under_review', 'approved', 'changes_required', 'rejected', 'suspended') then
    raise exception 'Unsupported product review decision: %', p_decision;
  end if;

  select candidate.*
  into product
  from public.products candidate
  where candidate.id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found.';
  end if;

  if not (
    (product.product_approval_status = 'submitted' and p_decision in ('under_review', 'approved', 'changes_required', 'rejected'))
    or (product.product_approval_status = 'under_review' and p_decision in ('approved', 'changes_required', 'rejected'))
    or (product.product_approval_status = 'approved' and p_decision = 'suspended')
    or (product.product_approval_status = 'suspended' and p_decision = 'approved')
  ) then
    raise exception 'Invalid product transition: % -> %', product.product_approval_status, p_decision;
  end if;

  if p_decision in ('changes_required', 'rejected', 'suspended') and reason is null then
    raise exception 'A reason is required for this product decision.';
  end if;

  update public.products
  set product_approval_status = p_decision,
      status = case when p_decision = 'approved' then 'active' when p_decision = 'suspended' then 'archived' else 'draft' end,
      reviewed_by = current_user_id,
      reviewed_at = now(),
      review_note = reason,
      published_at = case when p_decision = 'approved' then coalesce(published_at, now()) else null end,
      suspended_at = case when p_decision = 'suspended' then now() when product.product_approval_status = 'suspended' and p_decision = 'approved' then null else suspended_at end,
      archived_at = case when p_decision = 'suspended' then now() when product.product_approval_status = 'suspended' and p_decision = 'approved' then null else archived_at end,
      updated_at = now()
  where id = p_product_id
  returning * into product;

  return product;
end;
$$;

revoke all on function public.review_creator_commerce_product(uuid, text, text) from public;
grant execute on function public.review_creator_commerce_product(uuid, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shop-media',
  'shop-media',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists creator_commerce_shop_media_public_read on storage.objects;
drop policy if exists creator_commerce_shop_media_seller_insert on storage.objects;
drop policy if exists creator_commerce_shop_media_seller_update on storage.objects;
drop policy if exists creator_commerce_shop_media_seller_delete on storage.objects;

create policy creator_commerce_shop_media_public_read
on storage.objects
for select
to public
using (bucket_id = 'shop-media');

create policy creator_commerce_shop_media_seller_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'shop-media'
  and exists (
    select 1
    from public.storefronts storefront
    where storefront.owner_id = (select auth.uid())
      and storefront.id::text = (storage.foldername(storage.objects.name))[1]
  )
);

create policy creator_commerce_shop_media_seller_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'shop-media'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'shop-media'
  and owner_id = (select auth.uid()::text)
  and exists (
    select 1
    from public.storefronts storefront
    where storefront.owner_id = (select auth.uid())
      and storefront.id::text = (storage.foldername(storage.objects.name))[1]
  )
);

create policy creator_commerce_shop_media_seller_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'shop-media'
  and owner_id = (select auth.uid()::text)
);

alter table public.product_media enable row level security;

drop policy if exists creator_commerce_product_media_public_read on public.product_media;
drop policy if exists creator_commerce_product_media_seller_insert on public.product_media;
drop policy if exists creator_commerce_product_media_seller_update on public.product_media;
drop policy if exists creator_commerce_product_media_seller_delete on public.product_media;

create policy creator_commerce_product_media_public_read
on public.product_media
for select
to public
using (
  exists (
    select 1
    from public.products product
    where product.id = product_media.product_id
      and product.status = 'active'
      and product.product_approval_status = 'approved'
  )
  or exists (
    select 1
    from public.products product
    join public.storefronts storefront on storefront.id = product.storefront_id
    where product.id = product_media.product_id
      and storefront.owner_id = (select auth.uid())
  )
  or (select private.is_creator_commerce_admin())
);

create policy creator_commerce_product_media_seller_insert
on public.product_media
for insert
to authenticated
with check (
  exists (
    select 1
    from public.products product
    join public.storefronts storefront on storefront.id = product.storefront_id
    where product.id = product_media.product_id
      and storefront.owner_id = (select auth.uid())
      and product.product_approval_status in ('draft', 'changes_required', 'rejected', 'approved')
  )
);

create policy creator_commerce_product_media_seller_update
on public.product_media
for update
to authenticated
using (
  exists (
    select 1
    from public.products product
    join public.storefronts storefront on storefront.id = product.storefront_id
    where product.id = product_media.product_id
      and storefront.owner_id = (select auth.uid())
      and product.product_approval_status in ('draft', 'changes_required', 'rejected', 'approved')
  )
)
with check (
  exists (
    select 1
    from public.products product
    join public.storefronts storefront on storefront.id = product.storefront_id
    where product.id = product_media.product_id
      and storefront.owner_id = (select auth.uid())
      and product.product_approval_status in ('draft', 'changes_required', 'rejected', 'approved')
  )
);

create policy creator_commerce_product_media_seller_delete
on public.product_media
for delete
to authenticated
using (
  exists (
    select 1
    from public.products product
    join public.storefronts storefront on storefront.id = product.storefront_id
    where product.id = product_media.product_id
      and storefront.owner_id = (select auth.uid())
      and product.product_approval_status in ('draft', 'changes_required', 'rejected', 'approved')
  )
);

create or replace function public.seller_update_creator_commerce_fulfillment(
  p_order_id uuid,
  p_status text,
  p_carrier text default '',
  p_tracking_number text default '',
  p_package_reference text default '',
  p_customer_note text default '',
  p_packing_evidence_path text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_order public.orders%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;
  if p_status not in ('confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled') then
    raise exception 'Unsupported fulfillment status.';
  end if;

  select candidate.*
  into current_order
  from public.orders candidate
  where candidate.id = p_order_id
    and public.can_manage_storefront(candidate.storefront_id)
  for update;

  if not found then
    raise exception 'Order not found or seller access denied.';
  end if;
  if current_order.payment_method = 'external' and current_order.payment_status not in ('captured', 'captured_test') then
    raise exception 'External payment must be confirmed before fulfillment.';
  end if;
  if not (
    (current_order.status in ('draft', 'placed') and p_status = 'confirmed')
    or (current_order.status = 'confirmed' and p_status = 'processing')
    or (current_order.status = 'processing' and p_status = 'shipped')
    or (current_order.status = 'shipped' and p_status = 'out_for_delivery')
    or (current_order.status = 'out_for_delivery' and p_status = 'delivered')
    or (current_order.status in ('draft', 'placed', 'confirmed', 'processing') and p_status = 'cancelled')
  ) then
    raise exception 'Invalid fulfillment transition: % -> %', current_order.status, p_status;
  end if;

  update public.orders
  set status = p_status,
      delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
      updated_at = now()
  where id = p_order_id
  returning * into current_order;

  insert into public.order_fulfillments (order_id, status, carrier, tracking_number, package_reference, customer_note, updated_by)
  values (p_order_id, p_status, trim(coalesce(p_carrier, '')), trim(coalesce(p_tracking_number, '')), trim(coalesce(p_package_reference, '')), trim(coalesce(p_customer_note, '')), current_user_id)
  on conflict (order_id) do update
  set status = excluded.status,
      carrier = excluded.carrier,
      tracking_number = excluded.tracking_number,
      package_reference = excluded.package_reference,
      customer_note = excluded.customer_note,
      updated_by = excluded.updated_by,
      updated_at = now();

  insert into public.order_events (order_id, actor_id, status, detail)
  values (p_order_id, current_user_id, p_status, coalesce(nullif(trim(p_customer_note), ''), 'Fulfillment status updated.'));

  if p_packing_evidence_path is not null then
    insert into public.commerce_order_evidence (owner_id, order_id, evidence_kind, storage_path)
    values (current_user_id, p_order_id, 'packing', p_packing_evidence_path)
    on conflict (storage_path) do nothing;
  end if;

  if p_status = 'delivered' then
    update public.order_items
    set return_window_ends_at = now() + make_interval(days => coalesce((
      select max(product.return_window_days)
      from public.products product
      where product.id = order_items.product_id
    ), 7)),
        commission_status = case when commission_status = 'pending' then 'confirmed' else commission_status end
    where order_id = p_order_id;

    update public.creator_commissions
    set status = 'confirmed',
        confirmed_at = coalesce(confirmed_at, now()),
        updated_at = now()
    where order_id = p_order_id
      and status = 'pending';
  end if;

  return current_order;
end;
$$;

revoke all on function public.seller_update_creator_commerce_fulfillment(uuid, text, text, text, text, text, text) from public;
grant execute on function public.seller_update_creator_commerce_fulfillment(uuid, text, text, text, text, text, text) to authenticated;

drop policy if exists commerce_order_evidence_owner_insert on public.commerce_order_evidence;
create policy commerce_order_evidence_owner_insert
on public.commerce_order_evidence
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and storage_path like ((select auth.uid())::text || '/%')
  and (
    (
      evidence_kind = 'packing'
      and order_id is not null
      and exists (
        select 1
        from public.orders evidence_order
        where evidence_order.id = commerce_order_evidence.order_id
          and public.can_manage_storefront(evidence_order.storefront_id)
      )
    )
    or (
      evidence_kind = 'unboxing'
      and order_id is not null
      and order_item_id is not null
      and exists (
        select 1
        from public.order_items evidence_item
        where evidence_item.id = commerce_order_evidence.order_item_id
          and evidence_item.order_id = commerce_order_evidence.order_id
          and evidence_item.buyer_id = (select auth.uid())
      )
    )
  )
);
