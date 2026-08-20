-- Seller return decisions use these terminal order states. Keep the database
-- constraint aligned with seller_review_creator_commerce_return and the order-event UI.
alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (
    status = any (
      array[
        'draft'::text,
        'placed'::text,
        'confirmed'::text,
        'processing'::text,
        'shipped'::text,
        'out_for_delivery'::text,
        'delivered'::text,
        'cancelled'::text,
        'return_requested'::text,
        'return_approved'::text,
        'return_rejected'::text,
        'refunded'::text
      ]
    )
  );
