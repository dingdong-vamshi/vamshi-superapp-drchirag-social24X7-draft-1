# Creator Commerce Final Test Guide

Run local checks:

```bash
npx tsc --noEmit
npm run test:creator-commerce
npm run test:games
npx expo export
```

Manual browser smoke:

1. Open `/commerce`.
2. Confirm Phase 1 onboarding statuses still load.
3. Open `/commerce/admin` as commerce admin.
4. Confirm existing seller/creator/professional application cards still render.
5. Scroll to `Product approval queue`.
6. Confirm the queue loads without console errors.

Seller lifecycle:

1. Sign in as an approved seller.
2. Open `/commerce/seller`.
3. Create a product draft.
4. Enable creator promotion.
5. Set creator commission between 5% and 70%.
6. Save draft.
7. Submit for approval.
8. Confirm product status becomes `submitted`.

Admin product approval:

1. Sign in as admin.
2. Open `/commerce/admin`.
3. Review the submitted product.
4. Click `Under review`, then `Approve live`.
5. Confirm product becomes live/approved.
6. Test `Changes required`, `Reject`, and `Suspend` with reasons on a non-critical test product.

Creator lifecycle:

1. Sign in as an approved creator.
2. Open `/commerce/creator`.
3. Confirm approved creator-enabled products appear.
4. Click `Promote`.
5. Confirm a tracking code is copied/displayed.
6. Add the product to cart through the promotion.

Checkout:

1. Fill buyer address.
2. Test external checkout; it should create checkout/order state with external integration pending.
3. Test COD with non-verified buyer KYC; it should be blocked.
4. As admin in test mode, mark buyer KYC verified and retry COD.
5. Confirm checkout group splits into seller orders and order items.

Fulfillment / returns / commission:

1. As seller, update order statuses through confirmed → processing → shipped → delivered.
2. Confirm commissions move from pending to confirmed after delivery.
3. As buyer, submit return request on delivered item.
4. As admin, approve/reject return request.
5. Confirm commission is withheld/reversed or restored depending on decision.
6. In test mode, release confirmed commission after the return window.

Known external-pending boundaries:

- Payment provider capture is not integrated.
- Delivery provider tracking is not integrated.
- Refund provider payout is not integrated.
- Creator bank payout provider is not integrated.

