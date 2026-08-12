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
