-- Return evidence is transaction-private. Commerce Admin reviews capability
-- applications, not buyer/seller return evidence or ordinary return workflow.
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
      )
  )
);
