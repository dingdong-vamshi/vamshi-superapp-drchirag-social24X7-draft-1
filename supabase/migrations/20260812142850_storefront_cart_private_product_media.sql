-- Batch B foundation: new draft media is private until the authoritative
-- product is approved. Existing approved shop-media objects remain readable so
-- current storefronts do not break during the rolling migration.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-media',
  'product-media',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.product_media
  add column if not exists storage_bucket text not null default 'shop-media',
  add column if not exists moderation_state text not null default 'public',
  add column if not exists original_filename text,
  add column if not exists mime_type text,
  add column if not exists bytes integer,
  add column if not exists width integer,
  add column if not exists height integer;

alter table public.product_media
  drop constraint if exists product_media_storage_bucket_check,
  add constraint product_media_storage_bucket_check
    check (storage_bucket in ('shop-media', 'product-media')),
  drop constraint if exists product_media_moderation_state_check,
  add constraint product_media_moderation_state_check
    check (moderation_state in ('draft', 'submitted', 'approved', 'rejected', 'public')),
  drop constraint if exists product_media_bytes_check,
  add constraint product_media_bytes_check
    check (bytes is null or bytes between 1 and 10485760),
  drop constraint if exists product_media_position_check,
  add constraint product_media_position_check
    check (position is null or position between 0 and 9);

create unique index if not exists product_media_product_position_key
  on public.product_media (product_id, position)
  where position is not null;

create unique index if not exists product_media_one_primary_key
  on public.product_media (product_id)
  where is_primary = true;

create or replace function private.can_manage_product_media_path(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.products product
    join public.storefronts storefront on storefront.id = product.storefront_id
    where storefront.owner_id = auth.uid()
      and product.id::text = split_part(object_name, '/', 3)
      and split_part(object_name, '/', 1) = auth.uid()::text
      and split_part(object_name, '/', 2) = 'products'
      and product.product_approval_status in ('draft', 'changes_required', 'rejected')
  );
$$;

create or replace function private.can_read_product_media_path(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.product_media media
    join public.products product on product.id = media.product_id
    join public.storefronts storefront on storefront.id = product.storefront_id
    where media.storage_bucket = 'product-media'
      and media.path = object_name
      and (
        (product.status = 'active' and product.product_approval_status = 'approved')
        or storefront.owner_id = auth.uid()
        or private.is_creator_commerce_admin()
      )
  );
$$;

revoke all on function private.can_manage_product_media_path(text) from public;
revoke all on function private.can_read_product_media_path(text) from public;
grant execute on function private.can_manage_product_media_path(text) to authenticated;
grant execute on function private.can_read_product_media_path(text) to anon, authenticated;

drop policy if exists product_media_private_read on storage.objects;
create policy product_media_private_read
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'product-media'
  and private.can_read_product_media_path(name)
);

drop policy if exists product_media_private_insert on storage.objects;
create policy product_media_private_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-media'
  and private.can_manage_product_media_path(name)
);

drop policy if exists product_media_private_update on storage.objects;
create policy product_media_private_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-media'
  and private.can_manage_product_media_path(name)
)
with check (
  bucket_id = 'product-media'
  and private.can_manage_product_media_path(name)
);

drop policy if exists product_media_private_delete on storage.objects;
create policy product_media_private_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-media'
  and private.can_manage_product_media_path(name)
);

-- Replace overlapping legacy metadata policies with lifecycle-aware policies.
drop policy if exists product_media_public_read on public.product_media;
drop policy if exists product_media_owner_read on public.product_media;
drop policy if exists product_media_owner_insert on public.product_media;
drop policy if exists product_media_owner_update on public.product_media;
drop policy if exists product_media_owner_delete on public.product_media;
drop policy if exists creator_commerce_product_media_read on public.product_media;
drop policy if exists creator_commerce_product_media_insert on public.product_media;
drop policy if exists creator_commerce_product_media_update on public.product_media;
drop policy if exists creator_commerce_product_media_delete on public.product_media;
drop policy if exists product_media_authorized_read on public.product_media;

create policy product_media_authorized_read
on public.product_media
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.products product
    join public.storefronts storefront on storefront.id = product.storefront_id
    where product.id = product_media.product_id
      and (
        (product.status = 'active' and product.product_approval_status = 'approved')
        or storefront.owner_id = (select auth.uid())
        or private.is_creator_commerce_admin()
      )
  )
);

drop policy if exists product_media_owner_insert on public.product_media;
create policy product_media_owner_insert
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
      and product.product_approval_status in ('draft', 'changes_required', 'rejected')
  )
);

drop policy if exists product_media_owner_update on public.product_media;
create policy product_media_owner_update
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
      and product.product_approval_status in ('draft', 'changes_required', 'rejected')
  )
)
with check (
  exists (
    select 1
    from public.products product
    join public.storefronts storefront on storefront.id = product.storefront_id
    where product.id = product_media.product_id
      and storefront.owner_id = (select auth.uid())
      and product.product_approval_status in ('draft', 'changes_required', 'rejected')
  )
);

drop policy if exists product_media_owner_delete on public.product_media;
create policy product_media_owner_delete
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
      and product.product_approval_status in ('draft', 'changes_required', 'rejected')
  )
);

create or replace function public.replace_creator_commerce_product_media(
  p_product_id uuid,
  p_media jsonb
)
returns setof public.product_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  media_count integer;
  primary_count integer;
  position_count integer;
begin
  if viewer is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.products product
    join public.storefronts storefront on storefront.id = product.storefront_id
    where product.id = p_product_id
      and storefront.owner_id = viewer
      and product.product_approval_status in ('draft', 'changes_required', 'rejected')
  ) then
    raise exception 'Only the Seller can manage media for an editable Product.';
  end if;

  if jsonb_typeof(p_media) <> 'array' then
    raise exception 'Product media must be an array.';
  end if;

  media_count := jsonb_array_length(p_media);
  if media_count < 1 or media_count > 10 then
    raise exception 'A Product requires between 1 and 10 images.';
  end if;

  select
    count(*) filter (where item.is_primary),
    count(distinct item.position)
  into primary_count, position_count
  from jsonb_to_recordset(p_media) as item(
    path text,
    media_type text,
    alt_text text,
    position integer,
    is_primary boolean,
    original_filename text,
    mime_type text,
    bytes integer,
    width integer,
    height integer
  );

  if primary_count <> 1 then
    raise exception 'Exactly one Product image must be the cover.';
  end if;
  if position_count <> media_count then
    raise exception 'Product media positions must be unique.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_media) as item(
      path text,
      media_type text,
      alt_text text,
      position integer,
      is_primary boolean,
      original_filename text,
      mime_type text,
      bytes integer,
      width integer,
      height integer
    )
    where item.position not between 0 and 9
      or item.media_type <> 'image'
      or item.mime_type not in ('image/jpeg', 'image/png', 'image/webp')
      or item.bytes not between 1 and 10485760
      or split_part(item.path, '/', 1) <> viewer::text
      or split_part(item.path, '/', 2) <> 'products'
      or split_part(item.path, '/', 3) <> p_product_id::text
  ) then
    raise exception 'One or more Product media items are invalid.';
  end if;

  delete from public.product_media where product_id = p_product_id;

  insert into public.product_media (
    product_id,
    path,
    media_type,
    alt_text,
    position,
    is_primary,
    storage_bucket,
    moderation_state,
    original_filename,
    mime_type,
    bytes,
    width,
    height
  )
  select
    p_product_id,
    item.path,
    item.media_type,
    coalesce(item.alt_text, ''),
    item.position,
    item.is_primary,
    'product-media',
    'draft',
    nullif(item.original_filename, ''),
    item.mime_type,
    item.bytes,
    item.width,
    item.height
  from jsonb_to_recordset(p_media) as item(
    path text,
    media_type text,
    alt_text text,
    position integer,
    is_primary boolean,
    original_filename text,
    mime_type text,
    bytes integer,
    width integer,
    height integer
  );

  update public.products
  set cover_path = (
    select path from public.product_media
    where product_id = p_product_id and is_primary = true
  )
  where id = p_product_id;

  return query
  select * from public.product_media
  where product_id = p_product_id
  order by position;
end;
$$;

revoke all on function public.replace_creator_commerce_product_media(uuid, jsonb) from public;
grant execute on function public.replace_creator_commerce_product_media(uuid, jsonb) to authenticated;

create or replace function private.require_product_cover_before_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.product_approval_status = 'submitted'
    and old.product_approval_status is distinct from new.product_approval_status
    and (
      select count(*)
      from public.product_media media
      where media.product_id = new.id and media.is_primary = true
    ) <> 1 then
    raise exception 'Add exactly one cover image before submitting this Product.';
  end if;
  return new;
end;
$$;

drop trigger if exists products_require_cover_before_submission on public.products;
create trigger products_require_cover_before_submission
before update of product_approval_status on public.products
for each row
execute function private.require_product_cover_before_submission();

create or replace function public.get_public_storefront_for_profile(target_user uuid)
returns table (id uuid, name text, slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select storefront.id, storefront.name, storefront.slug
  from public.storefronts storefront
  join public.creator_commerce_access access on access.user_id = storefront.owner_id
  where storefront.owner_id = target_user
    and storefront.active = true
    and storefront.verification_status = 'approved'
    and access.seller_status = 'approved'
  order by storefront.updated_at desc
  limit 1;
$$;

revoke all on function public.get_public_storefront_for_profile(uuid) from public;
grant execute on function public.get_public_storefront_for_profile(uuid) to authenticated;
