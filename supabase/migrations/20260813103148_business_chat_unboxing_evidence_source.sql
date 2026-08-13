alter table public.commerce_order_evidence
  add column if not exists evidence_source text not null default 'uploaded_file';

alter table public.commerce_order_evidence
  drop constraint if exists commerce_order_evidence_source_check;

alter table public.commerce_order_evidence
  add constraint commerce_order_evidence_source_check
  check (evidence_source in ('live_capture', 'uploaded_file'));

comment on column public.commerce_order_evidence.evidence_source is
  'User-visible provenance for private commerce evidence: live camera capture or an existing uploaded file.';

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
        join public.orders evidence_order on evidence_order.id = evidence_item.order_id
        where evidence_item.id = commerce_order_evidence.order_item_id
          and evidence_item.order_id = commerce_order_evidence.order_id
          and evidence_item.buyer_id = (select auth.uid())
          and evidence_order.status in ('delivered', 'return_requested', 'return_approved', 'return_rejected')
      )
    )
  )
);
