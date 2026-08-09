# Creator Commerce Developer Learning Guide

Phase 2 extends the existing Social 24x7 shop/seller foundation instead of replacing it.

Core model:

- `products.status` remains the existing live visibility switch: `draft`, `active`, `archived`.
- `products.product_approval_status` is the new admin review state: `draft`, `submitted`, `under_review`, `approved`, `changes_required`, `rejected`, `suspended`, `archived`.
- `checkout_groups` is the parent unified checkout.
- Existing `orders` remain seller child orders.
- `order_items` carry product, seller, buyer, promotion, creator, and commission snapshots.
- `creator_product_promotions` stores creator tracking codes.
- `creator_promotion_clicks` stores server-backed last-click attribution with a 7-day default window.
- `creator_commissions` stores commission lifecycle state.

Sensitive state is backend-owned through Supabase RPCs:

- `submit_creator_commerce_product`
- `review_creator_commerce_product`
- `create_creator_product_promotion`
- `record_creator_promotion_click`
- `upsert_creator_commerce_cart_item`
- `create_creator_commerce_checkout`
- `seller_update_creator_commerce_fulfillment`
- `submit_creator_commerce_return`
- admin-only test helpers for buyer KYC, external payment confirmation, and commission release

External providers are intentionally not faked. Payment, delivery provider, refund provider, and payout provider rows are marked `EXTERNAL INTEGRATION PENDING` where applicable.

Important rules:

- Seller platform commission is ₹0 for this phase.
- Creator product commission is seller-configured per product from 5% to 70%.
- COD is blocked unless `buyer_kyc_status = verified`.
- GST sellers can ship pan-India.
- Non-GST sellers are restricted to their registered state, enforced again in checkout RPC.
- Platform fee is backend-calculated once per unified checkout; default is ₹5.
- Product approval is required before shop/creator promotion visibility.

Primary files:

- `supabase/migrations/20260808071712_creator_commerce_phase_2_lifecycle.sql`
- `src/features/creatorCommerce/lifecycleRepository.ts`
- `src/features/creatorCommerce/LifecycleScreens.tsx`
- `src/features/creatorCommerce/CreatorCommerceScreens.tsx`

