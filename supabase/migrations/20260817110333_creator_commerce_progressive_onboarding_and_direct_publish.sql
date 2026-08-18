-- Creator Commerce progressive onboarding and direct Seller publishing.
-- This migration is additive and keeps existing approvals, products, orders,
-- promotions, commissions, evidence and conversations intact.

create table if not exists public.commerce_verification_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  identity_status text not null default 'not_started',
  gst_status text not null default 'not_started',
  pan_status text not null default 'not_started',
  bank_status text not null default 'not_started',
  live_kyc_status text not null default 'not_started',
  professional_status text not null default 'not_started',
  blue_tick_eligibility_status text not null default 'not_started',
  blue_tick_payment_status text not null default 'not_started',
  blue_tick_status text not null default 'not_started',
  provider_metadata jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_verification_identity_status_check check (identity_status in ('not_started','pending','manual_review','verified','failed','needs_information')),
  constraint commerce_verification_gst_status_check check (gst_status in ('not_started','pending','manual_review','verified','failed','needs_information')),
  constraint commerce_verification_pan_status_check check (pan_status in ('not_started','pending','manual_review','verified','failed','needs_information')),
  constraint commerce_verification_bank_status_check check (bank_status in ('not_started','pending','manual_review','verified','failed','needs_information')),
  constraint commerce_verification_live_kyc_status_check check (live_kyc_status in ('not_started','pending','manual_review','verified','failed','needs_information')),
  constraint commerce_verification_professional_status_check check (professional_status in ('not_started','pending','manual_review','verified','failed','needs_information','not_applicable')),
  constraint commerce_verification_blue_tick_eligibility_status_check check (blue_tick_eligibility_status in ('not_started','pending','eligible','ineligible','needs_information')),
  constraint commerce_verification_blue_tick_payment_status_check check (blue_tick_payment_status in ('not_started','pending','provider_confirmed','failed','refunded')),
  constraint commerce_verification_blue_tick_status_check check (blue_tick_status in ('not_started','inactive','active','suspended'))
);

alter table public.commerce_verification_profiles enable row level security;

drop policy if exists commerce_verification_profiles_owner_read on public.commerce_verification_profiles;
create policy commerce_verification_profiles_owner_read
on public.commerce_verification_profiles
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_creator_commerce_admin()));

drop policy if exists commerce_verification_profiles_admin_update on public.commerce_verification_profiles;
create policy commerce_verification_profiles_admin_update
on public.commerce_verification_profiles
for update to authenticated
using ((select private.is_creator_commerce_admin()))
with check ((select private.is_creator_commerce_admin()));

revoke all on public.commerce_verification_profiles from anon;
revoke insert, update, delete on public.commerce_verification_profiles from authenticated;
grant select on public.commerce_verification_profiles to authenticated;

create or replace function public.get_my_commerce_verification_profile()
returns public.commerce_verification_profiles
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  viewer uuid := auth.uid();
  result public.commerce_verification_profiles;
  access_row public.creator_commerce_access;
begin
  if viewer is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into access_row
  from public.creator_commerce_access
  where user_id = viewer;

  insert into public.commerce_verification_profiles (
    user_id,
    identity_status,
    professional_status,
    blue_tick_eligibility_status,
    blue_tick_status
  ) values (
    viewer,
    case when access_row.seller_status = 'approved' or access_row.creator_status = 'approved' then 'verified' else 'manual_review' end,
    case when access_row.professional_status = 'approved' then 'verified' when access_row.creator_status = 'approved' then 'not_applicable' else 'not_started' end,
    'not_started',
    'inactive'
  )
  on conflict (user_id) do nothing;

  update public.commerce_verification_profiles profile
  set identity_status = case
        when access_row.seller_status = 'approved' or access_row.creator_status = 'approved' then 'verified'
        else profile.identity_status
      end,
      professional_status = case
        when access_row.professional_status = 'approved' then 'verified'
        else profile.professional_status
      end,
      updated_at = now()
  where profile.user_id = viewer;

  select * into result
  from public.commerce_verification_profiles
  where user_id = viewer;

  return result;
end;
$function$;

revoke all on function public.get_my_commerce_verification_profile() from public;
revoke all on function public.get_my_commerce_verification_profile() from anon;
grant execute on function public.get_my_commerce_verification_profile() to authenticated;

create or replace function public.save_creator_commerce_onboarding_draft(
  p_kind text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  viewer uuid := auth.uid();
  existing_status text;
  merged_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  draft_name text;
  draft_store text;
  draft_slug text;
begin
  if viewer is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if jsonb_typeof(merged_payload) <> 'object' then
    raise exception 'Onboarding draft must be a JSON object.' using errcode = '22023';
  end if;

  if p_kind = 'seller' then
    select status into existing_status from public.seller_applications where owner_id = viewer;
    if existing_status in ('submitted','under_review','approved','suspended') then
      raise exception 'Seller application is locked while its current review state is active.' using errcode = '42501';
    end if;

    draft_name := coalesce(nullif(trim(merged_payload->>'legalName'), ''), 'Seller applicant');
    draft_store := coalesce(nullif(trim(merged_payload->>'storefrontName'), ''), 'Draft store');
    draft_slug := lower(regexp_replace(draft_store, '[^a-zA-Z0-9]+', '-', 'g'));
    draft_slug := trim(both '-' from draft_slug);
    if length(draft_slug) < 2 then
      draft_slug := 'draft-' || left(replace(viewer::text, '-', ''), 12);
    end if;
    draft_slug := left(draft_slug, 63);

    insert into public.seller_applications (
      owner_id, legal_name, storefront_name, storefront_slug, seller_type,
      seller_tier, business_type, state_code, registered_state, city, phone,
      email, address_line, pickup_address, return_address, identity_name,
      business_name, gstin, pan_number, document_path, exterior_evidence_path,
      interior_evidence_path, location_latitude, location_longitude, status, verification_mode,
      application_payload, updated_at
    ) values (
      viewer,
      draft_name,
      draft_store,
      draft_slug,
      case when merged_payload->>'sellerType' = 'gst' then 'gst' else 'non_gst' end,
      case when merged_payload->>'sellerType' = 'gst' then 'gst' else 'local' end,
      case when merged_payload->>'sellerType' = 'gst' then 'gst_registered' else 'local_individual' end,
      upper(coalesce(merged_payload->>'registeredState', '')),
      upper(coalesce(merged_payload->>'registeredState', '')),
      coalesce(merged_payload->>'city', ''),
      coalesce(merged_payload->>'phone', ''),
      lower(coalesce(merged_payload->>'email', '')),
      coalesce(merged_payload->>'addressLine', ''),
      coalesce(merged_payload->>'pickupAddress', ''),
      coalesce(merged_payload->>'returnAddress', ''),
      draft_name,
      coalesce(nullif(trim(merged_payload->>'businessName'), ''), draft_store),
      nullif(upper(trim(coalesce(merged_payload->>'gstin', ''))), ''),
      nullif(upper(trim(coalesce(merged_payload->>'panNumber', ''))), ''),
      nullif(merged_payload->>'documentPath', ''),
      nullif(merged_payload->>'exteriorEvidencePath', ''),
      nullif(merged_payload->>'interiorEvidencePath', ''),
      case when jsonb_typeof(merged_payload->'locationLatitude') = 'number' then (merged_payload->>'locationLatitude')::double precision else null end,
      case when jsonb_typeof(merged_payload->'locationLongitude') = 'number' then (merged_payload->>'locationLongitude')::double precision else null end,
      'draft',
      'manual',
      merged_payload,
      now()
    )
    on conflict (owner_id) do update set
      legal_name = excluded.legal_name,
      storefront_name = excluded.storefront_name,
      storefront_slug = excluded.storefront_slug,
      seller_type = excluded.seller_type,
      seller_tier = excluded.seller_tier,
      business_type = excluded.business_type,
      state_code = excluded.state_code,
      registered_state = excluded.registered_state,
      city = excluded.city,
      phone = excluded.phone,
      email = excluded.email,
      address_line = excluded.address_line,
      pickup_address = excluded.pickup_address,
      return_address = excluded.return_address,
      identity_name = excluded.identity_name,
      business_name = excluded.business_name,
      gstin = excluded.gstin,
      pan_number = excluded.pan_number,
      document_path = excluded.document_path,
      exterior_evidence_path = excluded.exterior_evidence_path,
      interior_evidence_path = excluded.interior_evidence_path,
      location_latitude = excluded.location_latitude,
      location_longitude = excluded.location_longitude,
      status = 'draft',
      application_payload = public.seller_applications.application_payload || excluded.application_payload,
      updated_at = now();

    return (select application_payload from public.seller_applications where owner_id = viewer);
  elsif p_kind = 'creator' then
    select status::text into existing_status from public.creator_applications where owner_id = viewer;
    if existing_status in ('submitted','under_review','approved','suspended') then
      raise exception 'Creator application is locked while its current review state is active.' using errcode = '42501';
    end if;

    insert into public.creator_applications (
      owner_id, creator_type, category, about, social_handles, identity_name,
      identity_document_path, status, application_payload, updated_at
    ) values (
      viewer,
      case when coalesce((merged_payload->>'professionalRequired')::boolean, false) then 'professional' else 'general' end,
      coalesce(merged_payload->>'macroCategory', ''),
      coalesce(merged_payload->>'about', ''),
      coalesce(merged_payload->'socialHandles', '{}'::jsonb),
      coalesce(merged_payload->>'identityName', ''),
      nullif(merged_payload->>'identityDocumentPath', ''),
      'draft',
      merged_payload,
      now()
    )
    on conflict (owner_id) do update set
      creator_type = excluded.creator_type,
      category = excluded.category,
      about = excluded.about,
      social_handles = excluded.social_handles,
      identity_name = excluded.identity_name,
      identity_document_path = excluded.identity_document_path,
      status = 'draft',
      application_payload = public.creator_applications.application_payload || excluded.application_payload,
      updated_at = now();

    return (select application_payload from public.creator_applications where owner_id = viewer);
  else
    raise exception 'Unsupported onboarding kind.' using errcode = '22023';
  end if;
end;
$function$;

revoke all on function public.save_creator_commerce_onboarding_draft(text, jsonb) from public;
revoke all on function public.save_creator_commerce_onboarding_draft(text, jsonb) from anon;
grant execute on function public.save_creator_commerce_onboarding_draft(text, jsonb) to authenticated;

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
set search_path to 'public', 'private'
as $function$
declare
  viewer uuid := auth.uid();
  storefront public.storefronts;
  result public.products;
begin
  if viewer is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.creator_commerce_access
    where user_id = viewer and seller_status = 'approved'
  ) then
    raise exception 'Approved Seller access is required.' using errcode = '42501';
  end if;

  select * into storefront from public.storefronts where owner_id = viewer limit 1;
  if storefront.id is null then
    raise exception 'Create the Seller storefront before adding Products.';
  end if;
  if nullif(trim(p_title), '') is null or nullif(trim(p_slug), '') is null or nullif(trim(p_sku), '') is null then
    raise exception 'Product title, slug and SKU are required.';
  end if;
  if p_creator_promotion_enabled and not (p_creator_commission_bps between 500 and 7000) then
    raise exception 'Creator commission must be between 5%% and 70%%.';
  end if;

  if p_product_id is null then
    insert into public.products (
      storefront_id, title, slug, brand, category, price_minor,
      sale_price_minor, inventory, sku, short_description, description,
      creator_promotion_enabled, creator_commission_bps, return_window_days,
      status, product_approval_status
    ) values (
      storefront.id, trim(p_title), trim(p_slug), storefront.name, p_category,
      greatest(p_price_minor, 0), case when p_sale_price_minor > 0 then p_sale_price_minor else null end,
      greatest(p_inventory, 0), trim(p_sku), left(trim(p_short_description), 180),
      trim(p_description), p_creator_promotion_enabled,
      case when p_creator_promotion_enabled then p_creator_commission_bps else 0 end,
      greatest(0, least(30, p_return_window_days)), 'draft', 'draft'
    ) returning * into result;
  else
    update public.products product set
      title = trim(p_title),
      slug = trim(p_slug),
      category = p_category,
      price_minor = greatest(p_price_minor, 0),
      sale_price_minor = case when p_sale_price_minor > 0 then p_sale_price_minor else null end,
      inventory = greatest(p_inventory, 0),
      sku = trim(p_sku),
      short_description = left(trim(p_short_description), 180),
      description = trim(p_description),
      creator_promotion_enabled = p_creator_promotion_enabled,
      creator_commission_bps = case when p_creator_promotion_enabled then p_creator_commission_bps else 0 end,
      return_window_days = greatest(0, least(30, p_return_window_days)),
      updated_at = now()
    where product.id = p_product_id and product.storefront_id = storefront.id
    returning * into result;
    if result.id is null then
      raise exception 'Product not found or Seller access denied.';
    end if;
  end if;

  return result;
end;
$function$;

revoke all on function public.save_creator_commerce_product(uuid,text,text,text,integer,integer,integer,text,text,text,boolean,integer,integer) from public;
revoke all on function public.save_creator_commerce_product(uuid,text,text,text,integer,integer,integer,text,text,text,boolean,integer,integer) from anon;
grant execute on function public.save_creator_commerce_product(uuid,text,text,text,integer,integer,integer,text,text,text,boolean,integer,integer) to authenticated;

create or replace function private.protect_creator_commerce_product_state()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if current_user in ('anon', 'authenticated') and not (select private.is_creator_commerce_admin()) then
    if tg_op = 'INSERT' then
      if new.status <> 'draft' or new.product_approval_status <> 'draft'
         or new.reviewed_by is not null or new.reviewed_at is not null then
        raise exception 'Product publication state is server-controlled.' using errcode = '42501';
      end if;
    elsif new.status is distinct from old.status
       or new.product_approval_status is distinct from old.product_approval_status
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at
       or new.suspended_at is distinct from old.suspended_at
       or new.archived_at is distinct from old.archived_at then
      raise exception 'Product publication state is server-controlled.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists protect_creator_commerce_product_state on public.products;
create trigger protect_creator_commerce_product_state
before insert or update on public.products
for each row execute function private.protect_creator_commerce_product_state();

create or replace function public.publish_creator_commerce_product(p_product_id uuid)
returns public.products
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  viewer uuid := auth.uid();
  result public.products;
begin
  if viewer is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.creator_commerce_access
    where user_id = viewer and seller_status = 'approved'
  ) then
    raise exception 'Approved Seller access is required.' using errcode = '42501';
  end if;

  select product.* into result
  from public.products product
  join public.storefronts storefront on storefront.id = product.storefront_id
  where product.id = p_product_id and storefront.owner_id = viewer
  for update of product;
  if result.id is null then
    raise exception 'Product not found or Seller access denied.' using errcode = '42501';
  end if;
  if nullif(trim(result.title), '') is null or nullif(trim(result.slug), '') is null
     or nullif(trim(result.sku), '') is null or result.price_minor <= 0 then
    raise exception 'Complete Product title, slug, SKU and price before publishing.';
  end if;
  if result.inventory <= 0 then
    raise exception 'Add available inventory before publishing.';
  end if;
  if not exists (select 1 from public.product_media where product_id = p_product_id) then
    raise exception 'Add at least one Product image before publishing.';
  end if;
  if result.creator_promotion_enabled and not (result.creator_commission_bps between 500 and 7000) then
    raise exception 'Creator commission must be between 5%% and 70%%.';
  end if;

  update public.products
  set status = 'active',
      product_approval_status = 'approved',
      approval_requested_at = null,
      reviewed_by = null,
      reviewed_at = null,
      review_note = null,
      published_at = coalesce(published_at, now()),
      suspended_at = null,
      archived_at = null,
      attributes = coalesce(attributes, '{}'::jsonb) || jsonb_build_object('publicationMode','seller_direct'),
      updated_at = now()
  where id = p_product_id
  returning * into result;

  return result;
end;
$function$;

revoke all on function public.publish_creator_commerce_product(uuid) from public;
revoke all on function public.publish_creator_commerce_product(uuid) from anon;
grant execute on function public.publish_creator_commerce_product(uuid) to authenticated;

create or replace function public.submit_creator_commerce_product(p_product_id uuid)
returns public.products
language sql
security definer
set search_path to 'public'
as $function$
  select public.publish_creator_commerce_product(p_product_id);
$function$;

revoke all on function public.submit_creator_commerce_product(uuid) from public;
revoke all on function public.submit_creator_commerce_product(uuid) from anon;
grant execute on function public.submit_creator_commerce_product(uuid) to authenticated;

create or replace function private.can_manage_product_media_path(object_name text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.products product
    join public.storefronts storefront on storefront.id = product.storefront_id
    where storefront.owner_id = auth.uid()
      and product.id::text = split_part(object_name, '/', 3)
      and split_part(object_name, '/', 1) = auth.uid()::text
      and split_part(object_name, '/', 2) = 'products'
      and product.product_approval_status in ('draft', 'changes_required', 'rejected', 'approved')
  );
$function$;

create or replace function public.replace_creator_commerce_product_media(p_product_id uuid, p_media jsonb)
returns setof public.product_media
language plpgsql
security definer
set search_path to ''
as $function$
declare
  viewer uuid := auth.uid();
  media_count integer;
  primary_count integer;
  position_count integer;
begin
  if viewer is null then raise exception 'Authentication required.'; end if;
  if not exists (
    select 1 from public.products product
    join public.storefronts storefront on storefront.id = product.storefront_id
    where product.id = p_product_id and storefront.owner_id = viewer
      and product.product_approval_status in ('draft','changes_required','rejected','approved')
  ) then
    raise exception 'Only the Seller can manage media for this Product.';
  end if;
  if jsonb_typeof(p_media) <> 'array' then raise exception 'Product media must be an array.'; end if;
  media_count := jsonb_array_length(p_media);
  if media_count < 1 or media_count > 10 then raise exception 'A Product requires between 1 and 10 images.'; end if;

  select count(*) filter (where item.is_primary), count(distinct item.position)
  into primary_count, position_count
  from jsonb_to_recordset(p_media) as item(
    path text, media_type text, alt_text text, position integer, is_primary boolean,
    original_filename text, mime_type text, bytes integer, width integer, height integer
  );
  if primary_count <> 1 then raise exception 'Exactly one Product image must be the cover.'; end if;
  if position_count <> media_count then raise exception 'Product media positions must be unique.'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_media) as item(
      path text, media_type text, alt_text text, position integer, is_primary boolean,
      original_filename text, mime_type text, bytes integer, width integer, height integer
    )
    where item.position not between 0 and 9 or item.media_type <> 'image'
      or item.mime_type not in ('image/jpeg','image/png','image/webp')
      or item.bytes not between 1 and 10485760
      or split_part(item.path,'/',1) <> viewer::text
      or split_part(item.path,'/',2) <> 'products'
      or split_part(item.path,'/',3) <> p_product_id::text
  ) then raise exception 'One or more Product media items are invalid.'; end if;

  delete from public.product_media where product_id = p_product_id;
  insert into public.product_media (
    product_id,path,media_type,alt_text,position,is_primary,storage_bucket,
    moderation_state,original_filename,mime_type,bytes,width,height
  )
  select p_product_id,item.path,item.media_type,coalesce(item.alt_text,''),item.position,
    item.is_primary,'product-media','draft',nullif(item.original_filename,''),item.mime_type,
    item.bytes,item.width,item.height
  from jsonb_to_recordset(p_media) as item(
    path text, media_type text, alt_text text, position integer, is_primary boolean,
    original_filename text, mime_type text, bytes integer, width integer, height integer
  );
  update public.products set cover_path = (
    select path from public.product_media where product_id=p_product_id and is_primary=true
  ) where id=p_product_id;
  return query select * from public.product_media where product_id=p_product_id order by position;
end;
$function$;

revoke all on function public.replace_creator_commerce_product_media(uuid,jsonb) from public;
revoke all on function public.replace_creator_commerce_product_media(uuid,jsonb) from anon;
grant execute on function public.replace_creator_commerce_product_media(uuid,jsonb) to authenticated;

revoke all on function private.can_manage_product_media_path(text) from public;
revoke all on function private.protect_creator_commerce_product_state() from public;

revoke all on function public.replace_creator_commerce_product_media(uuid, jsonb) from public;
grant execute on function public.replace_creator_commerce_product_media(uuid, jsonb) to authenticated;

comment on table public.commerce_verification_profiles is
'Provider-neutral, server-owned verification states for Commerce identity, tax, bank, professional and Blue Tick readiness.';
comment on function public.publish_creator_commerce_product(uuid) is
'Publishes a valid Product directly for its approved Seller while preserving Admin moderation and suspension.';
