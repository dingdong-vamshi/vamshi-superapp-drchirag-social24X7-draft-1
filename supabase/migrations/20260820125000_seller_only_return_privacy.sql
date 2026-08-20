-- Return evidence and decisions belong to the buyer/seller transaction only.
-- Commerce Admin reviews seller and creator applications, not ordinary returns.

drop policy if exists return_requests_authorized_read on public.return_requests;
create policy return_requests_buyer_seller_read
on public.return_requests
for select
to authenticated
using (
  buyer_id = (select auth.uid())
  or public.can_manage_storefront(storefront_id)
);

drop policy if exists return_requests_admin_update on public.return_requests;
drop policy if exists return_requests_buyer_insert on public.return_requests;

-- Submission and resolution both use security-definer RPCs which validate the
-- delivered item and the seller's storefront authority before changing state.
revoke insert, update on public.return_requests from authenticated;

drop policy if exists commerce_order_evidence_authorized_read on public.commerce_order_evidence;
create policy commerce_order_evidence_buyer_seller_read
on public.commerce_order_evidence
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1
    from public.orders commerce_order
    where commerce_order.id = commerce_order_evidence.order_id
      and (
        commerce_order.customer_id = (select auth.uid())
        or public.can_manage_storefront(commerce_order.storefront_id)
      )
  )
);
