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
  and (storage.foldername(name))[2] = 'products'
  and exists (
    select 1
    from public.storefronts storefront
    join public.products product on product.storefront_id = storefront.id
    where storefront.owner_id = (select auth.uid())
      and storefront.id::text = (storage.foldername(storage.objects.name))[1]
      and product.id::text = (storage.foldername(storage.objects.name))[3]
      and product.product_approval_status in ('draft', 'changes_required', 'rejected', 'approved')
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
  and (storage.foldername(name))[2] = 'products'
  and exists (
    select 1
    from public.storefronts storefront
    join public.products product on product.storefront_id = storefront.id
    where storefront.owner_id = (select auth.uid())
      and storefront.id::text = (storage.foldername(storage.objects.name))[1]
      and product.id::text = (storage.foldername(storage.objects.name))[3]
      and product.product_approval_status in ('draft', 'changes_required', 'rejected', 'approved')
  )
);

create policy creator_commerce_shop_media_seller_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'shop-media'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[2] = 'products'
  and exists (
    select 1
    from public.storefronts storefront
    join public.products product on product.storefront_id = storefront.id
    where storefront.owner_id = (select auth.uid())
      and storefront.id::text = (storage.foldername(storage.objects.name))[1]
      and product.id::text = (storage.foldername(storage.objects.name))[3]
      and product.product_approval_status in ('draft', 'changes_required', 'rejected', 'approved')
  )
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
      and product_media.path like storefront.id::text || '/products/' || product.id::text || '/%'
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
      and product_media.path like storefront.id::text || '/products/' || product.id::text || '/%'
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
