# Creator Commerce Final Manual Retest

Use the QA emails already supplied for the appropriate role and the shared QA password. Do not copy the password into screenshots, notes, or bug reports. Replace port `8098` if Expo prints another port.

## Test 1 — Seller draft and persistence

- Login as: approved seller
- Open: `http://localhost:8098/commerce/seller`
- Paste: title `Social24 Retest Product`, slug `social24-retest-product`, price `1000`, sale price `900`, inventory `10`, SKU `S24-RETEST-001`, description `Creator Commerce manual retest product`, commission `20`, return window `7`
- Click: `Save product draft`, then refresh the page
- Expected: one draft row remains with the same values; no duplicate appears

## Test 2 — Product media before submission

- Login as: approved seller
- Open: `http://localhost:8098/commerce/seller`, then click `Open advanced media studio`
- Paste: choose the draft row, then select one PNG or JPEG under `Add product media`
- Click: `Update product`, then return to `/commerce/seller`
- Expected: a success message appears and the same draft shows `Media 1/10`; if Storage RLS appears, the pending migration has not been applied

## Test 3 — Submit and approve product

- Login as: approved seller, then admin
- Open: seller `/commerce/seller`; admin `/commerce/admin`
- Paste: no additional data
- Click: seller `Submit for approval`; admin `Refresh applications`, `Under review`, `Approve live`
- Expected: status moves `draft -> submitted -> under_review -> approved`; only legal next actions are shown

## Test 4 — Creator promotion and attribution

- Login as: approved creator
- Open: `http://localhost:8098/commerce/creator`
- Paste: copy the generated buyer link after selecting the approved product
- Click: `Promote` or `Refresh promotion`, then open the buyer link
- Expected: one stable promotion/tracking record is reused and the buyer page says creator attribution was recorded

## Test 5 — Cart behavior

- Login as: normal buyer
- Open: the creator-attributed buyer link
- Paste: no additional data
- Click: `Add to cart`, increase quantity, decrease quantity, remove, then add again
- Expected: quantity and totals update correctly; the re-added item remains creator attributed

## Test 6 — External test checkout

- Login as: normal buyer
- Open: `http://localhost:8098/commerce/buyer`
- Paste: a test recipient, phone, address, city, state code, and postal code
- Click: `Checkout external`; then as admin open `/commerce/admin` and click the test-payment confirmation
- Expected: one checkout, seller order, and item are created with server-calculated subtotal, platform fee, total, and test-captured payment status

## Test 7 — COD and KYC gate

- Login as: normal buyer, then admin
- Open: buyer `/commerce/buyer`; admin `/commerce/admin`
- Paste: the same test delivery address
- Click: try `Checkout COD` before KYC; as admin move KYC through `Under review` and `Verify`; retry COD only if another test order is wanted
- Expected: COD is blocked before verified KYC; the buyer cannot self-verify; verified KYC removes that eligibility blocker

## Test 8 — Fulfilment and evidence

- Login as: approved seller
- Open: `http://localhost:8098/commerce/seller`
- Paste: choose one packing-evidence image
- Click: attach/replace packing evidence, then advance each displayed next action through `confirmed`, `processing`, `shipped`, `out for delivery`, and `delivered`
- Expected: only the legal next transition is offered; evidence previews and remains after refresh

## Test 9 — Return, unboxing evidence, and commission

- Login as: the buyer who placed the delivered order, then admin, then approved creator
- Open: buyer `/commerce/buyer`; admin `/commerce/admin`; creator `/commerce/creator`
- Paste: return reason `Manual QA return request` and one unboxing image
- Click: buyer `Submit return request`; admin `Approve return`; creator refresh
- Expected: return/refund-pending records appear, unboxing evidence persists, and the attributed commission becomes reversed

## Test 10 — Access isolation

- Login as: a normal non-admin QA account
- Open: `http://localhost:8098/commerce/admin`, `/commerce/seller`, and `/commerce/creator`
- Paste: no additional data
- Click: try protected actions if any are displayed
- Expected: admin review and unapproved seller/creator tools stay blocked; no other user’s product, promotion, order, commission, KYC, payment, or return can be changed
