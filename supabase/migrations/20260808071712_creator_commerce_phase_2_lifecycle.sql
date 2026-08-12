create or replace function private.is_creator_commerce_admin()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'commerce_admin', false)
    or coalesce((select auth.jwt() -> 'app_metadata' -> 'roles') ? 'commerce_admin', false)
    or exists (
      select 1
      from public.creator_commerce_access access
      where access.user_id = (select auth.uid())
        and access.admin_access = true
    );
$$;

revoke all on function private.is_creator_commerce_admin() from public;
grant execute on function private.is_creator_commerce_admin() to authenticated;

create table if not exists public.commerce_runtime_config (
  singleton boolean primary key default true,
  attribution_window_days integer not null default 7,
  platform_fee_minor integer not null default 500,
  test_mode_enabled boolean not null default true,
  environment text not null default 'development',
  updated_at timestamptz not null default now(),
  constraint commerce_runtime_config_singleton_check check (singleton),
  constraint commerce_runtime_config_attribution_window_check check (attribution_window_days between 1 and 30),
  constraint commerce_runtime_config_platform_fee_check check (platform_fee_minor between 0 and 100000),
  constraint commerce_runtime_config_environment_check check (environment in ('development','test','staging','production'))
);

insert into public.commerce_runtime_config (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.products
  add column if not exists sale_price_minor integer,
  add column if not exists inventory_reserved integer not null default 0,
  add column if not exists fulfillment_type text not null default 'seller_self_fulfilled',
  add column if not exists return_window_days integer not null default 7,
  add column if not exists creator_promotion_enabled boolean not null default false,
  add column if not exists creator_commission_bps integer not null default 0,
  add column if not exists product_approval_status text not null default 'draft',
  add column if not exists approval_requested_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text,
  add column if not exists suspended_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists external_integration_status text not null default 'EXTERNAL INTEGRATION PENDING';

alter table public.orders
  add column if not exists checkout_group_id uuid,
  add column if not exists delivery_address_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists platform_fee_minor integer not null default 0,
  add column if not exists delivered_at timestamptz,
  add column if not exists external_integration_status text not null default 'EXTERNAL INTEGRATION PENDING';

alter table public.products drop constraint if exists products_sale_price_minor_check;
alter table public.products add constraint products_sale_price_minor_check check (sale_price_minor is null or sale_price_minor >= 0);
alter table public.products drop constraint if exists products_inventory_reserved_check;
alter table public.products add constraint products_inventory_reserved_check check (inventory_reserved >= 0 and inventory_reserved <= inventory);
alter table public.products drop constraint if exists products_fulfillment_type_check;
alter table public.products add constraint products_fulfillment_type_check check (fulfillment_type in ('seller_self_fulfilled','external_3pl_pending'));
alter table public.products drop constraint if exists products_return_window_days_check;
alter table public.products add constraint products_return_window_days_check check (return_window_days between 0 and 30);
alter table public.products drop constraint if exists products_creator_commission_bps_check;
alter table public.products add constraint products_creator_commission_bps_check check (
  (creator_promotion_enabled = false and creator_commission_bps = 0)
  or (creator_promotion_enabled = true and creator_commission_bps between 500 and 7000)
);
alter table public.products drop constraint if exists products_product_approval_status_check;
alter table public.products add constraint products_product_approval_status_check check (product_approval_status in ('draft','submitted','under_review','approved','changes_required','rejected','suspended','archived'));

create table if not exists public.creator_product_promotions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  storefront_id uuid not null references public.storefronts(id) on delete cascade,
  status text not null default 'active',
  tracking_code text not null default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 14)),
  commission_bps_snapshot integer not null,
  self_promoted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_product_promotions_status_check check (status in ('active','paused','removed')),
  constraint creator_product_promotions_commission_check check (commission_bps_snapshot between 500 and 7000),
  unique (creator_id, product_id),
  unique (tracking_code)
);

create table if not exists public.creator_promotion_clicks (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.creator_product_promotions(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  buyer_id uuid references public.profiles(id) on delete set null,
  tracking_code text not null,
  source text not null default 'link',
  clicked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null default 1,
  promotion_id uuid references public.creator_product_promotions(id) on delete set null,
  attribution_click_id uuid references public.creator_promotion_clicks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_items_quantity_check check (quantity between 1 and 99),
  unique (buyer_id, product_id)
);

create table if not exists public.buyer_delivery_addresses (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Home',
  recipient_name text not null,
  phone text not null default '',
  address_line1 text not null,
  address_line2 text not null default '',
  city text not null,
  state_code text not null,
  postal_code text not null,
  country_code text not null default 'IN',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buyer_delivery_addresses_state_check check (char_length(state_code) between 2 and 10),
  constraint buyer_delivery_addresses_country_check check (country_code = 'IN')
);

create table if not exists public.checkout_groups (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'started',
  currency char(3) not null default 'INR',
  subtotal_minor integer not null default 0,
  platform_fee_minor integer not null default 0,
  total_minor integer not null default 0,
  payment_method text not null,
  payment_status text not null default 'not_configured',
  idempotency_key uuid not null,
  delivery_address_id uuid references public.buyer_delivery_addresses(id) on delete set null,
  delivery_address_snapshot jsonb not null default '{}'::jsonb,
  external_integration_status text not null default 'EXTERNAL INTEGRATION PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checkout_groups_status_check check (status in ('started','external_payment_pending','placed','completed','cancelled','failed')),
  constraint checkout_groups_payment_method_check check (payment_method in ('cod','external')),
  constraint checkout_groups_money_check check (subtotal_minor >= 0 and platform_fee_minor >= 0 and total_minor >= 0),
  unique (buyer_id, idempotency_key)
);

alter table public.orders drop constraint if exists orders_checkout_group_id_fkey;
alter table public.orders add constraint orders_checkout_group_id_fkey foreign key (checkout_group_id) references public.checkout_groups(id) on delete set null;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  checkout_group_id uuid not null references public.checkout_groups(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  storefront_id uuid not null references public.storefronts(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_title_snapshot text not null,
  product_slug_snapshot text not null,
  storefront_name_snapshot text not null,
  unit_price_minor integer not null,
  quantity integer not null,
  subtotal_minor integer not null,
  promotion_id uuid references public.creator_product_promotions(id) on delete set null,
  promotion_click_id uuid references public.creator_promotion_clicks(id) on delete set null,
  creator_id uuid references public.profiles(id) on delete set null,
  commission_bps_snapshot integer not null default 0,
  commission_minor integer not null default 0,
  commission_status text not null default 'none',
  return_window_ends_at timestamptz,
  created_at timestamptz not null default now(),
  constraint order_items_quantity_check check (quantity > 0),
  constraint order_items_money_check check (unit_price_minor >= 0 and subtotal_minor >= 0 and commission_minor >= 0),
  constraint order_items_commission_status_check check (commission_status in ('none','pending','withheld','reversed','confirmed','paid'))
);

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  checkout_group_id uuid not null references public.checkout_groups(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'external_pending',
  status text not null default 'external_integration_pending',
  amount_minor integer not null,
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_attempts_status_check check (status in ('external_integration_pending','authorized','captured','failed','cancelled','cod_pending','cod_collected')),
  constraint payment_attempts_amount_check check (amount_minor >= 0)
);

create table if not exists public.commerce_order_evidence (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  evidence_kind text not null,
  storage_path text not null,
  file_name text,
  mime_type text,
  file_size integer,
  created_at timestamptz not null default now(),
  constraint commerce_order_evidence_kind_check check (evidence_kind in ('packing','handoff','delivery','unboxing','return_pickup','return_received')),
  unique (storage_path)
);

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  storefront_id uuid not null references public.storefronts(id) on delete cascade,
  creator_id uuid references public.profiles(id) on delete set null,
  status text not null default 'submitted',
  reason text not null,
  admin_note text,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  constraint return_requests_status_check check (status in ('submitted','under_review','approved','rejected','cancelled','received','refunded'))
);

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  return_request_id uuid not null references public.return_requests(id) on delete cascade,
  checkout_group_id uuid not null references public.checkout_groups(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  amount_minor integer not null,
  status text not null default 'external_integration_pending',
  provider text not null default 'external_pending',
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refund_requests_amount_check check (amount_minor >= 0),
  constraint refund_requests_status_check check (status in ('external_integration_pending','approved','paid','failed','cancelled'))
);

create table if not exists public.creator_commissions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  storefront_id uuid not null references public.storefronts(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  promotion_id uuid references public.creator_product_promotions(id) on delete set null,
  promotion_click_id uuid references public.creator_promotion_clicks(id) on delete set null,
  checkout_group_id uuid not null references public.checkout_groups(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  eligible_item_minor integer not null,
  commission_bps_snapshot integer not null,
  commission_minor integer not null,
  status text not null default 'pending',
  confirmed_at timestamptz,
  eligible_at timestamptz,
  payout_requested_at timestamptz,
  paid_at timestamptz,
  reversal_reason text,
  external_integration_status text not null default 'EXTERNAL INTEGRATION PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_commissions_amount_check check (eligible_item_minor >= 0 and commission_minor >= 0),
  constraint creator_commissions_bps_check check (commission_bps_snapshot between 500 and 7000),
  constraint creator_commissions_status_check check (status in ('pending','confirmed','eligible','payable','paid','withheld','reversed','cancelled')),
  unique (order_item_id)
);

create table if not exists public.commerce_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null,
  title text not null,
  body text not null default '',
  entity_table text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists products_approval_status_idx on public.products (product_approval_status, updated_at desc);
create index if not exists products_active_commission_idx on public.products (status, creator_promotion_enabled) where status = 'active';
create index if not exists creator_product_promotions_creator_idx on public.creator_product_promotions (creator_id, status);
create index if not exists creator_product_promotions_product_idx on public.creator_product_promotions (product_id, status);
create index if not exists creator_promotion_clicks_buyer_product_idx on public.creator_promotion_clicks (buyer_id, product_id, clicked_at desc);
create index if not exists cart_items_buyer_idx on public.cart_items (buyer_id, updated_at desc);
create index if not exists checkout_groups_buyer_idx on public.checkout_groups (buyer_id, created_at desc);
create index if not exists orders_checkout_group_idx on public.orders (checkout_group_id);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_creator_idx on public.order_items (creator_id, created_at desc) where creator_id is not null;
create index if not exists creator_commissions_creator_idx on public.creator_commissions (creator_id, status, created_at desc);
create index if not exists return_requests_buyer_idx on public.return_requests (buyer_id, requested_at desc);
create index if not exists commerce_notifications_recipient_idx on public.commerce_notifications (recipient_id, created_at desc);

alter table public.commerce_runtime_config enable row level security;
alter table public.creator_product_promotions enable row level security;
alter table public.creator_promotion_clicks enable row level security;
alter table public.cart_items enable row level security;
alter table public.buyer_delivery_addresses enable row level security;
alter table public.checkout_groups enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.commerce_order_evidence enable row level security;
alter table public.return_requests enable row level security;
alter table public.refund_requests enable row level security;
alter table public.creator_commissions enable row level security;
alter table public.commerce_notifications enable row level security;

grant select on public.commerce_runtime_config to authenticated;
grant select, insert, update on public.creator_product_promotions to authenticated;
grant select, insert on public.creator_promotion_clicks to authenticated;
grant select, insert, update, delete on public.cart_items to authenticated;
grant select, insert, update, delete on public.buyer_delivery_addresses to authenticated;
grant select on public.checkout_groups to authenticated;
grant select on public.order_items to authenticated;
grant select on public.payment_attempts to authenticated;
grant select, insert on public.commerce_order_evidence to authenticated;
grant select, insert, update on public.return_requests to authenticated;
grant select on public.refund_requests to authenticated;
grant select on public.creator_commissions to authenticated;
grant select, update on public.commerce_notifications to authenticated;

drop policy if exists commerce_runtime_config_read on public.commerce_runtime_config;
create policy commerce_runtime_config_read on public.commerce_runtime_config for select to authenticated using (true);

drop policy if exists creator_product_promotions_read on public.creator_product_promotions;
create policy creator_product_promotions_read on public.creator_product_promotions for select to authenticated using (
  creator_id = (select auth.uid())
  or exists (select 1 from public.products p where p.id = product_id and public.can_manage_storefront(p.storefront_id))
  or (status = 'active' and exists (select 1 from public.products p where p.id = product_id and p.status = 'active' and p.product_approval_status = 'approved'))
  or (select private.is_creator_commerce_admin())
);

drop policy if exists creator_product_promotions_creator_insert on public.creator_product_promotions;
create policy creator_product_promotions_creator_insert on public.creator_product_promotions for insert to authenticated with check (
  creator_id = (select auth.uid())
  and exists (select 1 from public.creator_commerce_access a where a.user_id = (select auth.uid()) and a.creator_status = 'approved')
  and exists (select 1 from public.products p where p.id = product_id and p.status = 'active' and p.product_approval_status = 'approved' and p.creator_promotion_enabled)
);

drop policy if exists creator_product_promotions_creator_update on public.creator_product_promotions;
create policy creator_product_promotions_creator_update on public.creator_product_promotions for update to authenticated using (creator_id = (select auth.uid()) or (select private.is_creator_commerce_admin())) with check (creator_id = (select auth.uid()) or (select private.is_creator_commerce_admin()));

drop policy if exists creator_promotion_clicks_owner_read on public.creator_promotion_clicks;
create policy creator_promotion_clicks_owner_read on public.creator_promotion_clicks for select to authenticated using (buyer_id = (select auth.uid()) or creator_id = (select auth.uid()) or (select private.is_creator_commerce_admin()));

drop policy if exists creator_promotion_clicks_owner_insert on public.creator_promotion_clicks;
create policy creator_promotion_clicks_owner_insert on public.creator_promotion_clicks for insert to authenticated with check (buyer_id = (select auth.uid()));

drop policy if exists cart_items_owner_all on public.cart_items;
create policy cart_items_owner_all on public.cart_items for all to authenticated using (buyer_id = (select auth.uid())) with check (buyer_id = (select auth.uid()));

drop policy if exists buyer_delivery_addresses_owner_all on public.buyer_delivery_addresses;
create policy buyer_delivery_addresses_owner_all on public.buyer_delivery_addresses for all to authenticated using (buyer_id = (select auth.uid())) with check (buyer_id = (select auth.uid()));

drop policy if exists checkout_groups_buyer_read on public.checkout_groups;
create policy checkout_groups_buyer_read on public.checkout_groups for select to authenticated using (buyer_id = (select auth.uid()) or (select private.is_creator_commerce_admin()));

drop policy if exists order_items_authorized_read on public.order_items;
create policy order_items_authorized_read on public.order_items for select to authenticated using (
  buyer_id = (select auth.uid())
  or seller_id = (select auth.uid())
  or creator_id = (select auth.uid())
  or public.can_manage_storefront(storefront_id)
  or (select private.is_creator_commerce_admin())
);

drop policy if exists payment_attempts_buyer_read on public.payment_attempts;
create policy payment_attempts_buyer_read on public.payment_attempts for select to authenticated using (buyer_id = (select auth.uid()) or (select private.is_creator_commerce_admin()));

drop policy if exists commerce_order_evidence_authorized_read on public.commerce_order_evidence;
create policy commerce_order_evidence_authorized_read on public.commerce_order_evidence for select to authenticated using (
  owner_id = (select auth.uid())
  or exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = (select auth.uid()) or public.can_manage_storefront(o.storefront_id)))
  or (select private.is_creator_commerce_admin())
);

drop policy if exists commerce_order_evidence_owner_insert on public.commerce_order_evidence;
create policy commerce_order_evidence_owner_insert on public.commerce_order_evidence for insert to authenticated with check (owner_id = (select auth.uid()) and storage_path like ((select auth.uid())::text || '/%'));

drop policy if exists return_requests_authorized_read on public.return_requests;
create policy return_requests_authorized_read on public.return_requests for select to authenticated using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()) or creator_id = (select auth.uid()) or public.can_manage_storefront(storefront_id) or (select private.is_creator_commerce_admin()));

drop policy if exists return_requests_buyer_insert on public.return_requests;
create policy return_requests_buyer_insert on public.return_requests for insert to authenticated with check (buyer_id = (select auth.uid()));

drop policy if exists return_requests_admin_update on public.return_requests;
create policy return_requests_admin_update on public.return_requests for update to authenticated using ((select private.is_creator_commerce_admin())) with check ((select private.is_creator_commerce_admin()));

drop policy if exists refund_requests_authorized_read on public.refund_requests;
create policy refund_requests_authorized_read on public.refund_requests for select to authenticated using (buyer_id = (select auth.uid()) or (select private.is_creator_commerce_admin()));

drop policy if exists creator_commissions_authorized_read on public.creator_commissions;
create policy creator_commissions_authorized_read on public.creator_commissions for select to authenticated using (creator_id = (select auth.uid()) or seller_id = (select auth.uid()) or public.can_manage_storefront(storefront_id) or (select private.is_creator_commerce_admin()));

drop policy if exists commerce_notifications_recipient_read on public.commerce_notifications;
create policy commerce_notifications_recipient_read on public.commerce_notifications for select to authenticated using (recipient_id = (select auth.uid()) or (select private.is_creator_commerce_admin()));

drop policy if exists commerce_notifications_recipient_update on public.commerce_notifications;
create policy commerce_notifications_recipient_update on public.commerce_notifications for update to authenticated using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

drop policy if exists products_admin_read on public.products;
create policy products_admin_read on public.products for select to authenticated using ((select private.is_creator_commerce_admin()));

drop policy if exists products_admin_update on public.products;
create policy products_admin_update on public.products for update to authenticated using ((select private.is_creator_commerce_admin())) with check ((select private.is_creator_commerce_admin()));

drop policy if exists orders_admin_read on public.orders;
create policy orders_admin_read on public.orders for select to authenticated using ((select private.is_creator_commerce_admin()));

drop policy if exists orders_admin_update on public.orders;
create policy orders_admin_update on public.orders for update to authenticated using ((select private.is_creator_commerce_admin())) with check ((select private.is_creator_commerce_admin()));

create or replace function private.commerce_test_mode_enabled()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce((select test_mode_enabled and environment <> 'production' from public.commerce_runtime_config where singleton = true), false);
$$;

revoke all on function private.commerce_test_mode_enabled() from public;
grant execute on function private.commerce_test_mode_enabled() to authenticated;

create or replace function public.submit_creator_commerce_product(p_product_id uuid)
returns public.products
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_product public.products;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  select p.* into v_product
  from public.products p
  where p.id = p_product_id
    and public.can_manage_storefront(p.storefront_id)
  for update;

  if not found then
    raise exception 'Product not found or seller access denied.';
  end if;

  if not exists (select 1 from public.creator_commerce_access a where a.user_id = v_user and a.seller_status = 'approved') then
    raise exception 'Seller approval is required before product submission.';
  end if;

  if v_product.creator_promotion_enabled and not (v_product.creator_commission_bps between 500 and 7000) then
    raise exception 'Creator commission must be between 5%% and 70%%.';
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
  returning * into v_product;

  return v_product;
end;
$$;

revoke all on function public.submit_creator_commerce_product(uuid) from public;
grant execute on function public.submit_creator_commerce_product(uuid) to authenticated;

create or replace function public.review_creator_commerce_product(p_product_id uuid, p_decision text, p_reason text default null)
returns public.products
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_product public.products;
  v_status text;
  v_approval text;
begin
  if v_user is null or not (select private.is_creator_commerce_admin()) then
    raise exception 'Commerce admin access required.';
  end if;

  if p_decision not in ('under_review','approved','changes_required','rejected','suspended','archived') then
    raise exception 'Unsupported product review decision: %', p_decision;
  end if;

  if p_decision in ('changes_required','rejected','suspended') and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required for this product decision.';
  end if;

  v_approval := p_decision;
  v_status := case when p_decision = 'approved' then 'active' when p_decision in ('suspended','archived') then 'archived' else 'draft' end;

  update public.products
  set product_approval_status = v_approval,
      status = v_status,
      reviewed_by = v_user,
      reviewed_at = now(),
      review_note = nullif(trim(coalesce(p_reason, '')), ''),
      published_at = case when p_decision = 'approved' then coalesce(published_at, now()) else null end,
      suspended_at = case when p_decision = 'suspended' then now() else suspended_at end,
      archived_at = case when p_decision = 'archived' then now() else archived_at end,
      updated_at = now()
  where id = p_product_id
  returning * into v_product;

  if not found then
    raise exception 'Product not found.';
  end if;

  return v_product;
end;
$$;

revoke all on function public.review_creator_commerce_product(uuid, text, text) from public;
grant execute on function public.review_creator_commerce_product(uuid, text, text) to authenticated;

create or replace function public.create_creator_product_promotion(p_product_id uuid)
returns public.creator_product_promotions
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_product record;
  v_promotion public.creator_product_promotions;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (select 1 from public.creator_commerce_access a where a.user_id = v_user and a.creator_status = 'approved') then
    raise exception 'Creator approval is required before promotion.';
  end if;

  select p.id, p.storefront_id, p.creator_commission_bps, s.owner_id as seller_id
  into v_product
  from public.products p
  join public.storefronts s on s.id = p.storefront_id
  where p.id = p_product_id
    and p.status = 'active'
    and p.product_approval_status = 'approved'
    and p.creator_promotion_enabled = true;

  if not found then
    raise exception 'Product is not approved for creator promotion.';
  end if;

  insert into public.creator_product_promotions (creator_id, product_id, storefront_id, commission_bps_snapshot, self_promoted, status)
  values (v_user, v_product.id, v_product.storefront_id, v_product.creator_commission_bps, v_product.seller_id = v_user, 'active')
  on conflict (creator_id, product_id) do update
    set status = 'active',
        commission_bps_snapshot = excluded.commission_bps_snapshot,
        self_promoted = excluded.self_promoted,
        updated_at = now()
  returning * into v_promotion;

  return v_promotion;
end;
$$;

revoke all on function public.create_creator_product_promotion(uuid) from public;
grant execute on function public.create_creator_product_promotion(uuid) to authenticated;

create or replace function public.record_creator_promotion_click(p_tracking_code text, p_source text default 'link')
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_promotion public.creator_product_promotions;
  v_click_id uuid;
  v_days integer;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  select coalesce(attribution_window_days, 7) into v_days
  from public.commerce_runtime_config
  where singleton = true;

  select promo.* into v_promotion
  from public.creator_product_promotions promo
  join public.products p on p.id = promo.product_id
  where promo.tracking_code = p_tracking_code
    and promo.status = 'active'
    and p.status = 'active'
    and p.product_approval_status = 'approved';

  if not found then
    raise exception 'Promotion link is not active.';
  end if;

  insert into public.creator_promotion_clicks (promotion_id, creator_id, product_id, buyer_id, tracking_code, source, expires_at)
  values (v_promotion.id, v_promotion.creator_id, v_promotion.product_id, v_user, v_promotion.tracking_code, coalesce(nullif(trim(p_source), ''), 'link'), now() + make_interval(days => v_days))
  returning id into v_click_id;

  return v_click_id;
end;
$$;

revoke all on function public.record_creator_promotion_click(text, text) from public;
grant execute on function public.record_creator_promotion_click(text, text) to authenticated;

create or replace function public.upsert_creator_commerce_cart_item(p_product_id uuid, p_quantity integer, p_tracking_code text default null)
returns public.cart_items
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_click_id uuid;
  v_promotion_id uuid;
  v_cart public.cart_items;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (select 1 from public.products p where p.id = p_product_id and p.status = 'active' and p.product_approval_status = 'approved') then
    raise exception 'Product is not live.';
  end if;

  if p_quantity <= 0 then
    delete from public.cart_items where buyer_id = v_user and product_id = p_product_id returning * into v_cart;
    return v_cart;
  end if;

  if p_quantity > 99 then
    raise exception 'Quantity limit exceeded.';
  end if;

  if nullif(trim(coalesce(p_tracking_code, '')), '') is not null then
    v_click_id := public.record_creator_promotion_click(p_tracking_code, 'cart');
  else
    select c.id into v_click_id
    from public.creator_promotion_clicks c
    join public.creator_product_promotions promo on promo.id = c.promotion_id
    where c.buyer_id = v_user
      and c.product_id = p_product_id
      and c.expires_at > now()
      and promo.status = 'active'
    order by c.clicked_at desc
    limit 1;
  end if;

  if v_click_id is not null then
    select promotion_id into v_promotion_id from public.creator_promotion_clicks where id = v_click_id;
  end if;

  insert into public.cart_items (buyer_id, product_id, quantity, promotion_id, attribution_click_id)
  values (v_user, p_product_id, p_quantity, v_promotion_id, v_click_id)
  on conflict (buyer_id, product_id) do update
    set quantity = excluded.quantity,
        promotion_id = excluded.promotion_id,
        attribution_click_id = excluded.attribution_click_id,
        updated_at = now()
  returning * into v_cart;

  return v_cart;
end;
$$;

revoke all on function public.upsert_creator_commerce_cart_item(uuid, integer, text) from public;
grant execute on function public.upsert_creator_commerce_cart_item(uuid, integer, text) to authenticated;

create or replace function public.create_creator_commerce_checkout(p_address_id uuid, p_payment_method text, p_idempotency_key uuid default gen_random_uuid())
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_existing uuid;
  v_group_id uuid;
  v_address public.buyer_delivery_addresses;
  v_platform_fee integer;
  v_subtotal integer := 0;
  v_total integer := 0;
  v_method text := lower(trim(coalesce(p_payment_method, '')));
  v_group_status text;
  v_payment_status text;
  v_order_status text;
  v_line record;
  v_product record;
  v_order_id uuid;
  v_order_subtotal integer;
  v_unit_price integer;
  v_line_subtotal integer;
  v_commission_minor integer;
  v_seller_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  if v_method = 'online' then
    v_method := 'external';
  end if;
  if v_method not in ('cod','external') then
    raise exception 'Payment method must be cod or external.';
  end if;

  select id into v_existing from public.checkout_groups where buyer_id = v_user and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_address from public.buyer_delivery_addresses where id = p_address_id and buyer_id = v_user;
  if not found then
    raise exception 'Delivery address not found.';
  end if;

  if v_method = 'cod' and not exists (select 1 from public.creator_commerce_access a where a.user_id = v_user and a.buyer_kyc_status = 'verified') then
    raise exception 'Cash on delivery requires verified buyer KYC.';
  end if;

  select platform_fee_minor into v_platform_fee from public.commerce_runtime_config where singleton = true;
  v_platform_fee := coalesce(v_platform_fee, 500);

  insert into public.checkout_groups (buyer_id, status, payment_method, payment_status, idempotency_key, delivery_address_id, delivery_address_snapshot)
  values (v_user, 'started', v_method, case when v_method = 'cod' then 'cod_pending' else 'external_integration_pending' end, p_idempotency_key, p_address_id, to_jsonb(v_address))
  returning id into v_group_id;

  drop table if exists cc_checkout_orders;
  create temp table cc_checkout_orders (storefront_id uuid primary key, order_id uuid not null, subtotal_minor integer not null default 0) on commit drop;

  for v_line in
    select ci.product_id, ci.quantity, ci.promotion_id, ci.attribution_click_id
    from public.cart_items ci
    where ci.buyer_id = v_user
    order by ci.created_at
  loop
    select p.id, p.storefront_id, p.title, p.slug, p.price_minor, p.sale_price_minor, p.inventory, p.inventory_reserved, p.return_window_days,
           s.name as storefront_name, s.owner_id as seller_id, s.seller_tier, s.state_code,
           promo.id as promo_id, promo.creator_id, promo.commission_bps_snapshot,
           click.id as click_id
    into v_product
    from public.products p
    join public.storefronts s on s.id = p.storefront_id
    left join public.creator_product_promotions promo on promo.id = v_line.promotion_id and promo.status = 'active'
    left join public.creator_promotion_clicks click on click.id = v_line.attribution_click_id and click.expires_at > now()
    where p.id = v_line.product_id
      and p.status = 'active'
      and p.product_approval_status = 'approved'
    for update of p;

    if not found then
      raise exception 'A cart product is no longer live.';
    end if;

    if v_product.inventory - v_product.inventory_reserved < v_line.quantity then
      raise exception 'Insufficient inventory for %.', v_product.title;
    end if;

    if v_product.seller_tier = 'local' and upper(v_product.state_code) <> upper(v_address.state_code) then
      raise exception 'Non-GST seller delivery is limited to seller registered state.';
    end if;

    select order_id, subtotal_minor into v_order_id, v_order_subtotal
    from cc_checkout_orders
    where storefront_id = v_product.storefront_id;

    if v_order_id is null then
      insert into public.orders (customer_id, storefront_id, status, subtotal_minor, total_minor, payment_method, payment_status, idempotency_key, checkout_group_id, delivery_address_snapshot, platform_fee_minor)
      values (v_user, v_product.storefront_id, case when v_method = 'cod' then 'placed' else 'draft' end, 0, 0, v_method, case when v_method = 'cod' then 'cod_pending' else 'external_integration_pending' end, gen_random_uuid(), v_group_id, to_jsonb(v_address), 0)
      returning id into v_order_id;

      insert into cc_checkout_orders (storefront_id, order_id, subtotal_minor) values (v_product.storefront_id, v_order_id, 0);
    end if;

    v_unit_price := coalesce(v_product.sale_price_minor, v_product.price_minor);
    v_line_subtotal := v_unit_price * v_line.quantity;
    v_commission_minor := case when v_product.creator_id is not null and v_product.click_id is not null then floor(v_line_subtotal * v_product.commission_bps_snapshot / 10000.0)::integer else 0 end;
    v_seller_id := v_product.seller_id;

    insert into public.order_items (order_id, checkout_group_id, buyer_id, storefront_id, seller_id, product_id, product_title_snapshot, product_slug_snapshot, storefront_name_snapshot, unit_price_minor, quantity, subtotal_minor, promotion_id, promotion_click_id, creator_id, commission_bps_snapshot, commission_minor, commission_status)
    values (v_order_id, v_group_id, v_user, v_product.storefront_id, v_seller_id, v_product.id, v_product.title, v_product.slug, v_product.storefront_name, v_unit_price, v_line.quantity, v_line_subtotal, v_product.promo_id, v_product.click_id, v_product.creator_id, coalesce(v_product.commission_bps_snapshot, 0), v_commission_minor, case when v_commission_minor > 0 then 'pending' else 'none' end);

    if v_commission_minor > 0 then
      insert into public.creator_commissions (creator_id, seller_id, storefront_id, product_id, promotion_id, promotion_click_id, checkout_group_id, order_id, order_item_id, eligible_item_minor, commission_bps_snapshot, commission_minor, status)
      select v_product.creator_id, v_seller_id, v_product.storefront_id, v_product.id, v_product.promo_id, v_product.click_id, v_group_id, v_order_id, oi.id, v_line_subtotal, v_product.commission_bps_snapshot, v_commission_minor, 'pending'
      from public.order_items oi
      where oi.order_id = v_order_id and oi.product_id = v_product.id and oi.created_at = (select max(created_at) from public.order_items where order_id = v_order_id and product_id = v_product.id);
    end if;

    update public.products set inventory_reserved = inventory_reserved + v_line.quantity, updated_at = now() where id = v_product.id;
    update cc_checkout_orders set subtotal_minor = subtotal_minor + v_line_subtotal where storefront_id = v_product.storefront_id;
    v_subtotal := v_subtotal + v_line_subtotal;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'Cart is empty.';
  end if;

  for v_line in select * from cc_checkout_orders loop
    update public.orders
    set subtotal_minor = v_line.subtotal_minor,
        total_minor = v_line.subtotal_minor,
        updated_at = now()
    where id = v_line.order_id;

    insert into public.order_events (order_id, actor_id, status, detail)
    values (v_line.order_id, v_user, case when v_method = 'cod' then 'placed' else 'draft' end, case when v_method = 'cod' then 'COD order placed. Delivery provider integration pending.' else 'External payment integration pending.' end);
  end loop;

  v_total := v_subtotal + v_platform_fee;
  update public.checkout_groups
  set subtotal_minor = v_subtotal,
      platform_fee_minor = v_platform_fee,
      total_minor = v_total,
      status = case when v_method = 'cod' then 'placed' else 'external_payment_pending' end,
      updated_at = now()
  where id = v_group_id;

  insert into public.payment_attempts (checkout_group_id, buyer_id, provider, status, amount_minor)
  values (v_group_id, v_user, case when v_method = 'cod' then 'cod' else 'external_pending' end, case when v_method = 'cod' then 'cod_pending' else 'external_integration_pending' end, v_total);

  delete from public.cart_items where buyer_id = v_user;

  return v_group_id;
end;
$$;

revoke all on function public.create_creator_commerce_checkout(uuid, text, uuid) from public;
grant execute on function public.create_creator_commerce_checkout(uuid, text, uuid) to authenticated;

create or replace function public.seller_update_creator_commerce_fulfillment(p_order_id uuid, p_status text, p_carrier text default '', p_tracking_number text default '', p_package_reference text default '', p_customer_note text default '', p_packing_evidence_path text default null)
returns public.orders
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_order public.orders;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;
  if p_status not in ('confirmed','processing','shipped','out_for_delivery','delivered','cancelled') then
    raise exception 'Unsupported fulfillment status.';
  end if;

  select * into v_order from public.orders where id = p_order_id and public.can_manage_storefront(storefront_id) for update;
  if not found then
    raise exception 'Order not found or seller access denied.';
  end if;

  update public.orders
  set status = p_status,
      delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.order_fulfillments (order_id, status, carrier, tracking_number, package_reference, customer_note, updated_by)
  values (p_order_id, p_status, trim(coalesce(p_carrier,'')), trim(coalesce(p_tracking_number,'')), trim(coalesce(p_package_reference,'')), trim(coalesce(p_customer_note,'')), v_user)
  on conflict (order_id) do update
    set status = excluded.status,
        carrier = excluded.carrier,
        tracking_number = excluded.tracking_number,
        package_reference = excluded.package_reference,
        customer_note = excluded.customer_note,
        updated_by = excluded.updated_by,
        updated_at = now();

  insert into public.order_events (order_id, actor_id, status, detail)
  values (p_order_id, v_user, p_status, coalesce(nullif(trim(p_customer_note), ''), 'Fulfillment status updated.'));

  if p_packing_evidence_path is not null then
    insert into public.commerce_order_evidence (owner_id, order_id, evidence_kind, storage_path)
    values (v_user, p_order_id, 'packing', p_packing_evidence_path)
    on conflict (storage_path) do nothing;
  end if;

  if p_status = 'delivered' then
    update public.order_items
    set return_window_ends_at = now() + make_interval(days => coalesce((select max(p.return_window_days) from public.products p where p.id = order_items.product_id), 7))
    where order_id = p_order_id;

    update public.creator_commissions
    set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()), updated_at = now()
    where order_id = p_order_id and status = 'pending';
  end if;

  return v_order;
end;
$$;

revoke all on function public.seller_update_creator_commerce_fulfillment(uuid, text, text, text, text, text, text) from public;
grant execute on function public.seller_update_creator_commerce_fulfillment(uuid, text, text, text, text, text, text) to authenticated;

create or replace function public.submit_creator_commerce_return(p_order_item_id uuid, p_reason text)
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
  if v_user is null then
    raise exception 'Authentication required.';
  end if;
  if nullif(trim(coalesce(p_reason,'')), '') is null then
    raise exception 'Return reason is required.';
  end if;

  select oi.*, o.status as order_status, o.delivered_at
  into v_item
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id and oi.buyer_id = v_user
  for update;

  if not found then
    raise exception 'Order item not found.';
  end if;
  if v_item.order_status <> 'delivered' then
    raise exception 'Returns open after delivery.';
  end if;
  if v_item.return_window_ends_at is not null and v_item.return_window_ends_at < now() then
    raise exception 'Return window has elapsed.';
  end if;

  insert into public.return_requests (order_item_id, order_id, buyer_id, seller_id, storefront_id, creator_id, reason)
  values (v_item.id, v_item.order_id, v_user, v_item.seller_id, v_item.storefront_id, v_item.creator_id, trim(p_reason))
  returning * into v_return;

  update public.orders set status = 'return_requested', updated_at = now() where id = v_item.order_id;
  update public.order_items set commission_status = 'withheld' where id = v_item.id and commission_status in ('pending','confirmed');
  update public.creator_commissions set status = 'withheld', updated_at = now() where order_item_id = v_item.id and status in ('pending','confirmed','eligible','payable');

  return v_return;
end;
$$;

revoke all on function public.submit_creator_commerce_return(uuid, text) from public;
grant execute on function public.submit_creator_commerce_return(uuid, text) to authenticated;

create or replace function public.admin_review_creator_commerce_return(p_return_request_id uuid, p_decision text, p_reason text default null)
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
  if v_user is null or not (select private.is_creator_commerce_admin()) then
    raise exception 'Commerce admin access required.';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Return decision must be approved or rejected.';
  end if;

  update public.return_requests
  set status = p_decision,
      admin_note = nullif(trim(coalesce(p_reason,'')), ''),
      reviewed_by = v_user,
      reviewed_at = now()
  where id = p_return_request_id
  returning * into v_return;

  if not found then
    raise exception 'Return request not found.';
  end if;

  select * into v_item from public.order_items where id = v_return.order_item_id;

  if p_decision = 'approved' then
    insert into public.refund_requests (return_request_id, checkout_group_id, order_id, buyer_id, amount_minor, status)
    values (v_return.id, v_item.checkout_group_id, v_item.order_id, v_item.buyer_id, v_item.subtotal_minor, 'external_integration_pending');
    update public.order_items set commission_status = 'reversed' where id = v_item.id;
    update public.creator_commissions set status = 'reversed', reversal_reason = coalesce(nullif(trim(p_reason), ''), 'Return approved'), updated_at = now() where order_item_id = v_item.id;
  else
    update public.order_items set commission_status = case when commission_minor > 0 then 'confirmed' else 'none' end where id = v_item.id;
    update public.creator_commissions set status = 'confirmed', updated_at = now() where order_item_id = v_item.id and status = 'withheld';
  end if;

  return v_return;
end;
$$;

revoke all on function public.admin_review_creator_commerce_return(uuid, text, text) from public;
grant execute on function public.admin_review_creator_commerce_return(uuid, text, text) to authenticated;

create or replace function public.admin_set_buyer_kyc_status_for_test(p_user_id uuid, p_status buyer_kyc_status)
returns public.creator_commerce_access
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_access public.creator_commerce_access;
begin
  if auth.uid() is null or not (select private.is_creator_commerce_admin()) then
    raise exception 'Commerce admin access required.';
  end if;
  if not (select private.commerce_test_mode_enabled()) then
    raise exception 'Creator Commerce test mode is disabled.';
  end if;

  insert into public.creator_commerce_access (user_id, buyer_kyc_status, reviewed_by, reviewed_at)
  values (p_user_id, p_status, auth.uid(), now())
  on conflict (user_id) do update
    set buyer_kyc_status = excluded.buyer_kyc_status,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        updated_at = now()
  returning * into v_access;

  return v_access;
end;
$$;

revoke all on function public.admin_set_buyer_kyc_status_for_test(uuid, buyer_kyc_status) from public;
grant execute on function public.admin_set_buyer_kyc_status_for_test(uuid, buyer_kyc_status) to authenticated;

create or replace function public.admin_confirm_checkout_payment_for_test(p_checkout_group_id uuid)
returns public.checkout_groups
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_group public.checkout_groups;
begin
  if auth.uid() is null or not (select private.is_creator_commerce_admin()) then
    raise exception 'Commerce admin access required.';
  end if;
  if not (select private.commerce_test_mode_enabled()) then
    raise exception 'Creator Commerce test mode is disabled.';
  end if;

  update public.checkout_groups
  set status = 'placed', payment_status = 'captured_test', updated_at = now()
  where id = p_checkout_group_id and payment_method = 'external'
  returning * into v_group;

  if not found then
    raise exception 'External checkout group not found.';
  end if;

  update public.orders set status = 'placed', payment_status = 'captured_test', updated_at = now() where checkout_group_id = p_checkout_group_id;
  update public.payment_attempts set status = 'captured', updated_at = now() where checkout_group_id = p_checkout_group_id;

  return v_group;
end;
$$;

revoke all on function public.admin_confirm_checkout_payment_for_test(uuid) from public;
grant execute on function public.admin_confirm_checkout_payment_for_test(uuid) to authenticated;

create or replace function public.admin_release_creator_commissions_for_test(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not (select private.is_creator_commerce_admin()) then
    raise exception 'Commerce admin access required.';
  end if;
  if not (select private.commerce_test_mode_enabled()) then
    raise exception 'Creator Commerce test mode is disabled.';
  end if;

  update public.creator_commissions
  set status = 'eligible', eligible_at = now(), updated_at = now()
  where order_id = p_order_id and status = 'confirmed';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_release_creator_commissions_for_test(uuid) from public;
grant execute on function public.admin_release_creator_commissions_for_test(uuid) to authenticated;
