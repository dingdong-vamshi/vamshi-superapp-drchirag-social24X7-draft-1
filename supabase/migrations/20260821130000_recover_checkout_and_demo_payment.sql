-- Recover abandoned demo checkouts without deleting their audit trail, then make
-- the supported COD and demo-online paths complete atomically without Admin work.

with abandoned_product_quantities as (
  select item.product_id, sum(item.quantity)::integer as quantity
  from public.order_items item
  join public.orders commerce_order on commerce_order.id = item.order_id
  join public.checkout_groups checkout_group on checkout_group.id = commerce_order.checkout_group_id
  where checkout_group.status = 'external_payment_pending'
    and checkout_group.payment_status = 'external_integration_pending'
    and commerce_order.status = 'draft'
  group by item.product_id
)
update public.products product
set inventory_reserved = greatest(0, product.inventory_reserved - abandoned.quantity),
    updated_at = now()
from abandoned_product_quantities abandoned
where product.id = abandoned.product_id;

update public.order_items item
set commission_status = case when item.commission_status = 'pending' then 'reversed' else item.commission_status end
from public.orders commerce_order
join public.checkout_groups checkout_group on checkout_group.id = commerce_order.checkout_group_id
where item.order_id = commerce_order.id
  and checkout_group.status = 'external_payment_pending'
  and checkout_group.payment_status = 'external_integration_pending'
  and commerce_order.status = 'draft';

update public.creator_commissions commission
set status = 'cancelled',
    reversal_reason = coalesce(commission.reversal_reason, 'Abandoned demo checkout reservation released.'),
    updated_at = now()
from public.orders commerce_order
join public.checkout_groups checkout_group on checkout_group.id = commerce_order.checkout_group_id
where commission.order_id = commerce_order.id
  and checkout_group.status = 'external_payment_pending'
  and checkout_group.payment_status = 'external_integration_pending'
  and commerce_order.status = 'draft'
  and commission.status = 'pending';

update public.payment_attempts payment_attempt
set status = 'failed',
    updated_at = now()
from public.checkout_groups checkout_group
where payment_attempt.checkout_group_id = checkout_group.id
  and checkout_group.status = 'external_payment_pending'
  and checkout_group.payment_status = 'external_integration_pending'
  and payment_attempt.status = 'external_integration_pending';

update public.orders commerce_order
set status = 'cancelled',
    payment_status = 'failed',
    updated_at = now()
from public.checkout_groups checkout_group
where commerce_order.checkout_group_id = checkout_group.id
  and checkout_group.status = 'external_payment_pending'
  and checkout_group.payment_status = 'external_integration_pending'
  and commerce_order.status = 'draft';

update public.checkout_groups checkout_group
set status = 'failed',
    payment_status = 'failed',
    external_integration_status = 'DEMO CHECKOUT EXPIRED',
    updated_at = now()
where checkout_group.status = 'external_payment_pending'
  and checkout_group.payment_status = 'external_integration_pending';

create or replace function public.create_creator_commerce_checkout(
  p_address_id uuid,
  p_payment_method text,
  p_idempotency_key uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing_checkout_id uuid;
  checkout_id uuid;
  delivery_address public.buyer_delivery_addresses%rowtype;
  platform_fee integer := 500;
  checkout_subtotal integer := 0;
  checkout_total integer := 0;
  selected_payment_method text := lower(trim(coalesce(p_payment_method, '')));
  selected_payment_status text;
  cart_line record;
  product_row record;
  order_id uuid;
  order_item_id uuid;
  order_subtotal integer;
  unit_price integer;
  line_subtotal integer;
  commission_minor integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if selected_payment_method = 'online' then
    selected_payment_method := 'external';
  end if;
  if selected_payment_method not in ('cod', 'external') then
    raise exception 'Payment method must be COD or demo online payment.';
  end if;

  select checkout_group.id
  into existing_checkout_id
  from public.checkout_groups checkout_group
  where checkout_group.buyer_id = current_user_id
    and checkout_group.idempotency_key = p_idempotency_key;

  if existing_checkout_id is not null then
    return existing_checkout_id;
  end if;

  select address.*
  into delivery_address
  from public.buyer_delivery_addresses address
  where address.id = p_address_id
    and address.buyer_id = current_user_id;

  if not found then
    raise exception 'Delivery address not found.';
  end if;
  if nullif(trim(delivery_address.recipient_name), '') is null
    or nullif(trim(delivery_address.phone), '') is null
    or nullif(trim(delivery_address.address_line1), '') is null
    or nullif(trim(delivery_address.city), '') is null
    or nullif(trim(delivery_address.state_code), '') is null
    or nullif(trim(delivery_address.postal_code), '') is null then
    raise exception 'Complete every delivery field before placing the order.';
  end if;

  if selected_payment_method = 'cod'
    and not exists (
      select 1
      from public.creator_commerce_access access
      where access.user_id = current_user_id
        and access.buyer_kyc_status = 'verified'
    ) then
    raise exception 'Cash on delivery requires verified Buyer KYC.';
  end if;

  if not exists (
    select 1
    from public.cart_items cart_item
    where cart_item.buyer_id = current_user_id
  ) then
    raise exception 'Cart is empty.';
  end if;

  select config.platform_fee_minor
  into platform_fee
  from public.commerce_runtime_config config
  where config.singleton = true;
  platform_fee := coalesce(platform_fee, 500);
  selected_payment_status := case when selected_payment_method = 'cod' then 'cod_pending' else 'captured_test' end;

  insert into public.checkout_groups (
    buyer_id,
    status,
    payment_method,
    payment_status,
    idempotency_key,
    delivery_address_id,
    delivery_address_snapshot,
    external_integration_status
  ) values (
    current_user_id,
    'started',
    selected_payment_method,
    selected_payment_status,
    p_idempotency_key,
    p_address_id,
    to_jsonb(delivery_address),
    case when selected_payment_method = 'external' then 'DEMO PAYMENT CAPTURED' else 'COD PENDING' end
  )
  returning id into checkout_id;

  drop table if exists pg_temp.creator_checkout_orders;
  create temporary table creator_checkout_orders (
    storefront_id uuid primary key,
    order_id uuid not null,
    subtotal_minor integer not null default 0
  ) on commit drop;

  for cart_line in
    select
      cart_item.product_id,
      cart_item.quantity,
      cart_item.promotion_id,
      cart_item.attribution_click_id
    from public.cart_items cart_item
    where cart_item.buyer_id = current_user_id
    order by cart_item.created_at
  loop
    select
      product.id,
      product.storefront_id,
      product.title,
      product.slug,
      product.price_minor,
      product.sale_price_minor,
      product.inventory,
      product.inventory_reserved,
      product.return_window_days,
      storefront.name as storefront_name,
      storefront.owner_id as seller_id,
      storefront.seller_tier,
      storefront.state_code,
      promotion.id as promotion_id,
      promotion.creator_id,
      promotion.commission_bps_snapshot,
      promotion_click.id as promotion_click_id
    into product_row
    from public.products product
    join public.storefronts storefront on storefront.id = product.storefront_id
    left join public.creator_product_promotions promotion
      on promotion.id = cart_line.promotion_id
      and promotion.product_id = product.id
      and promotion.status = 'active'
    left join public.creator_promotion_clicks promotion_click
      on promotion_click.id = cart_line.attribution_click_id
      and promotion_click.promotion_id = promotion.id
      and promotion_click.product_id = product.id
      and promotion_click.creator_id = promotion.creator_id
      and promotion_click.buyer_id = current_user_id
      and promotion_click.expires_at > now()
    where product.id = cart_line.product_id
      and product.status = 'active'
      and product.product_approval_status = 'approved'
      and storefront.active = true
      and storefront.verification_status = 'approved'
    for update of product;

    if not found then
      raise exception 'A cart product is no longer available.';
    end if;
    if product_row.inventory - product_row.inventory_reserved < cart_line.quantity then
      raise exception 'Insufficient inventory for %.', product_row.title;
    end if;
    if product_row.seller_tier = 'local'
      and upper(product_row.state_code) <> upper(delivery_address.state_code) then
      raise exception 'Non-GST seller delivery is limited to the seller registered state.';
    end if;

    select checkout_order.order_id, checkout_order.subtotal_minor
    into order_id, order_subtotal
    from pg_temp.creator_checkout_orders checkout_order
    where checkout_order.storefront_id = product_row.storefront_id;

    if order_id is null then
      insert into public.orders (
        customer_id,
        storefront_id,
        status,
        subtotal_minor,
        total_minor,
        payment_method,
        payment_status,
        idempotency_key,
        checkout_group_id,
        delivery_address_snapshot,
        platform_fee_minor
      ) values (
        current_user_id,
        product_row.storefront_id,
        'placed',
        0,
        0,
        selected_payment_method,
        selected_payment_status,
        gen_random_uuid(),
        checkout_id,
        to_jsonb(delivery_address),
        0
      )
      returning id into order_id;

      insert into pg_temp.creator_checkout_orders (storefront_id, order_id)
      values (product_row.storefront_id, order_id);
    end if;

    unit_price := coalesce(product_row.sale_price_minor, product_row.price_minor);
    line_subtotal := unit_price * cart_line.quantity;
    commission_minor := case
      when product_row.promotion_click_id is not null
        then floor(line_subtotal * product_row.commission_bps_snapshot / 10000.0)::integer
      else 0
    end;

    insert into public.order_items (
      order_id,
      checkout_group_id,
      buyer_id,
      storefront_id,
      seller_id,
      product_id,
      product_title_snapshot,
      product_slug_snapshot,
      storefront_name_snapshot,
      unit_price_minor,
      quantity,
      subtotal_minor,
      promotion_id,
      promotion_click_id,
      creator_id,
      commission_bps_snapshot,
      commission_minor,
      commission_status
    ) values (
      order_id,
      checkout_id,
      current_user_id,
      product_row.storefront_id,
      product_row.seller_id,
      product_row.id,
      product_row.title,
      product_row.slug,
      product_row.storefront_name,
      unit_price,
      cart_line.quantity,
      line_subtotal,
      case when product_row.promotion_click_id is not null then product_row.promotion_id else null end,
      product_row.promotion_click_id,
      case when product_row.promotion_click_id is not null then product_row.creator_id else null end,
      case when product_row.promotion_click_id is not null then product_row.commission_bps_snapshot else 0 end,
      commission_minor,
      case when commission_minor > 0 then 'pending' else 'none' end
    )
    returning id into order_item_id;

    if commission_minor > 0 then
      insert into public.creator_commissions (
        creator_id,
        seller_id,
        storefront_id,
        product_id,
        promotion_id,
        promotion_click_id,
        checkout_group_id,
        order_id,
        order_item_id,
        eligible_item_minor,
        commission_bps_snapshot,
        commission_minor,
        status
      ) values (
        product_row.creator_id,
        product_row.seller_id,
        product_row.storefront_id,
        product_row.id,
        product_row.promotion_id,
        product_row.promotion_click_id,
        checkout_id,
        order_id,
        order_item_id,
        line_subtotal,
        product_row.commission_bps_snapshot,
        commission_minor,
        'pending'
      );
    end if;

    update public.products
    set inventory_reserved = inventory_reserved + cart_line.quantity,
        updated_at = now()
    where id = product_row.id;

    update pg_temp.creator_checkout_orders
    set subtotal_minor = subtotal_minor + line_subtotal
    where storefront_id = product_row.storefront_id;

    checkout_subtotal := checkout_subtotal + line_subtotal;
  end loop;

  for cart_line in
    select checkout_order.*
    from pg_temp.creator_checkout_orders checkout_order
  loop
    update public.orders
    set subtotal_minor = cart_line.subtotal_minor,
        total_minor = cart_line.subtotal_minor,
        updated_at = now()
    where id = cart_line.order_id;

    insert into public.order_events (order_id, actor_id, status, detail)
    values (
      cart_line.order_id,
      current_user_id,
      'placed',
      case
        when selected_payment_method = 'cod' then 'COD order placed.'
        else 'Demo online payment captured; order placed.'
      end
    );
  end loop;

  checkout_total := checkout_subtotal + platform_fee;
  update public.checkout_groups
  set subtotal_minor = checkout_subtotal,
      platform_fee_minor = platform_fee,
      total_minor = checkout_total,
      status = 'placed',
      updated_at = now()
  where id = checkout_id;

  insert into public.payment_attempts (
    checkout_group_id,
    buyer_id,
    provider,
    status,
    amount_minor,
    provider_reference
  ) values (
    checkout_id,
    current_user_id,
    case when selected_payment_method = 'cod' then 'cod' else 'demo_online' end,
    case when selected_payment_method = 'cod' then 'cod_pending' else 'captured' end,
    checkout_total,
    case when selected_payment_method = 'external' then 'DEMO-NO-REAL-CHARGE' else null end
  );

  delete from public.cart_items
  where buyer_id = current_user_id;

  return checkout_id;
end;
$$;

revoke all on function public.create_creator_commerce_checkout(uuid, text, uuid) from public, anon;
grant execute on function public.create_creator_commerce_checkout(uuid, text, uuid) to authenticated;

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
  if current_order.payment_method = 'external'
    and current_order.payment_status not in ('captured', 'captured_test') then
    raise exception 'Online payment must be captured before fulfillment.';
  end if;
  if not (
    (current_order.status = 'placed' and p_status = 'confirmed')
    or (current_order.status = 'confirmed' and p_status = 'processing')
    or (current_order.status = 'processing' and p_status = 'shipped')
    or (current_order.status = 'shipped' and p_status = 'out_for_delivery')
    or (current_order.status = 'out_for_delivery' and p_status = 'delivered')
    or (current_order.status in ('placed', 'confirmed', 'processing') and p_status = 'cancelled')
  ) then
    raise exception 'Invalid fulfillment transition: % -> %', current_order.status, p_status;
  end if;

  update public.orders
  set status = p_status,
      delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
      updated_at = now()
  where id = p_order_id
  returning * into current_order;

  insert into public.order_fulfillments (
    order_id,
    status,
    carrier,
    tracking_number,
    package_reference,
    customer_note,
    updated_by
  ) values (
    p_order_id,
    p_status,
    trim(coalesce(p_carrier, '')),
    trim(coalesce(p_tracking_number, '')),
    trim(coalesce(p_package_reference, '')),
    trim(coalesce(p_customer_note, '')),
    current_user_id
  )
  on conflict (order_id) do update
  set status = excluded.status,
      carrier = excluded.carrier,
      tracking_number = excluded.tracking_number,
      package_reference = excluded.package_reference,
      customer_note = excluded.customer_note,
      updated_by = excluded.updated_by,
      updated_at = now();

  insert into public.order_events (order_id, actor_id, status, detail)
  values (
    p_order_id,
    current_user_id,
    p_status,
    coalesce(nullif(trim(p_customer_note), ''), 'Fulfillment status updated.')
  );

  if p_packing_evidence_path is not null then
    insert into public.commerce_order_evidence (owner_id, order_id, evidence_kind, storage_path)
    values (current_user_id, p_order_id, 'packing', p_packing_evidence_path)
    on conflict (storage_path) do nothing;
  end if;

  if p_status = 'delivered' then
    update public.products product
    set inventory = greatest(0, product.inventory - sold.quantity),
        inventory_reserved = greatest(0, product.inventory_reserved - sold.quantity),
        updated_at = now()
    from (
      select item.product_id, sum(item.quantity)::integer as quantity
      from public.order_items item
      where item.order_id = p_order_id
      group by item.product_id
    ) sold
    where product.id = sold.product_id;

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
  elsif p_status = 'cancelled' then
    update public.products product
    set inventory_reserved = greatest(0, product.inventory_reserved - released.quantity),
        updated_at = now()
    from (
      select item.product_id, sum(item.quantity)::integer as quantity
      from public.order_items item
      where item.order_id = p_order_id
      group by item.product_id
    ) released
    where product.id = released.product_id;

    update public.order_items
    set commission_status = case when commission_status = 'pending' then 'reversed' else commission_status end
    where order_id = p_order_id;

    update public.creator_commissions
    set status = 'cancelled',
        reversal_reason = coalesce(reversal_reason, 'Order cancelled before delivery.'),
        updated_at = now()
    where order_id = p_order_id
      and status = 'pending';
  end if;

  return current_order;
end;
$$;

revoke all on function public.seller_update_creator_commerce_fulfillment(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.seller_update_creator_commerce_fulfillment(uuid, text, text, text, text, text, text) to authenticated;
