# Social 24x7 Creator Commerce
## Client End-to-End Testing & Usage Manual

This manual explains the Creator Commerce feature in simple language. It is based on the current application screens, routes, Supabase database rules, and the completed end-to-end test against project `nqwhmmigtbhrmmdvwzms`.

Important current boundary: the internal Creator Commerce lifecycle is working. Real payment capture, automatic identity verification, courier integration, refunds to a bank or card, and creator bank payouts still need their external providers.

## 1 What Creator Commerce Does

Creator Commerce lets different people work together around one product:

- A **Seller** owns a store, creates products, sets stock, chooses a creator commission, and fulfils orders.
- A **Creator** promotes approved products and receives commission records when an attributed purchase succeeds.
- A **Verified Professional** is a Creator with a separately approved professional credential. This does not replace Creator approval.
- A **Buyer** opens a creator link, adds products to a cart, checks out, follows orders, and can request a return.
- A **Commerce Admin** reviews seller, creator, professional, product, KYC test, payment test, and return states.

One account can have more than one role. For example, the confirmed Naveen test account is an approved Seller, Creator, and Professional. Each approval remains separate. Losing one approval does not automatically remove the others.

## 2 Where to Find Creator Commerce

Use the visible application path:

1. Sign in to Social 24x7.
2. Click or tap the **Wallet** tab in the bottom navigation.
3. On the Wallet screen, click **Open profile**.
4. In Profile, find the **Commerce** section.
5. Click **Creator Commerce**.
6. The page title should be **Creator Commerce**.

For development testing only, the direct URL is:

```text
http://localhost:8098/commerce
```

Do not treat the development URL as the normal client navigation path.

## 3 Understanding the Creator Commerce Home Page

The top four status cards show the signed-in account's server-owned access:

- **Seller**
- **Creator**
- **Professional**
- **Buyer KYC**

Possible application states include Not applied, Draft, Submitted, Under review, Needs information, Approved, Rejected, and Suspended. Buyer KYC uses its own states, including Not submitted and Verified.

The page can show these actions depending on the account:

- **Become a Seller** opens Seller onboarding.
- **Update Seller Application** appears after Admin requests more information.
- **Reapply as Seller** can appear after rejection.
- **Become a Creator** opens Creator onboarding.
- **Apply for Professional Verification** appears for an approved Creator who has not completed Professional verification.
- **Buyer marketplace** opens products, creator referral entry, cart, checkout, orders, evidence, and returns.
- **Seller tools** opens only when Seller is Approved.
- **Creator tools** opens only when Creator is Approved.
- **Admin review** opens only for a Commerce Admin.
- The round refresh icon reloads the current capability states from Supabase.

Greyed-out actions are locked. Hiding or disabling a button is only a convenience; the backend also checks access before important changes.

## 4 Confirmed Test Accounts

Passwords are not stored in this manual. Use the password provided separately by the development team.

| Role | Email | Confirmed capability | Use |
|---|---|---|---|
| Commerce Admin | `admin@gmail.com` | Admin review access | Applications, products, test payments, KYC test states, and returns |
| Seller and Creator | `naveen.qa24@gmail.com` | Approved Seller, Creator, and Professional | Products, media, promotion, commissions, and fulfilment |
| Normal Buyer | `yogesh.qa24@gmail.com` | Normal buyer; KYC was exercised through Admin test controls | Referral, cart, checkout, evidence, and returns |

The Naveen account deliberately demonstrates that one person can hold multiple independent roles.

No second approved Seller or second approved Creator is confirmed in the current test set. Do not assign those roles to Arjun or Kavya without first verifying them in Supabase and the Commerce home status cards.

## 5 Registering a New Seller

### Open the form

1. Sign in with a normal non-admin account.
2. Open **Wallet**.
3. Click **Open profile**.
4. Click **Creator Commerce**.
5. Click **Become a Seller**.
6. Confirm the page title is **Seller onboarding**.

### Choose the Seller type

- Choose **GST Registered Seller** when the Seller has a GSTIN. The current checkout rules allow an approved GST Seller to serve buyers across India.
- Choose **Non-GST Seller** when the Seller uses a PAN or local Seller ID. The current checkout rules limit delivery to the Seller's registered state.

This state restriction is checked again by the backend during checkout. Changing text on a page cannot bypass it.

### Complete every field

Enter:

- **Legal identity name** — the name on legal documents.
- **Store name** — the customer-facing store name.
- **Business name** — the registered or operating business name.
- **Registered state** — use the state name or code consistently.
- **City**
- **Phone**
- **Email**
- **GSTIN** for a GST Seller.
- **PAN / local seller ID** for a Non-GST Seller.
- **Store address**
- **Pickup address** — where a courier would collect parcels.
- **Return address** — where returned parcels would go.

### Attach private evidence

Upload all three requested items:

- **Government/business document**
- **Exterior shop/business evidence**
- **Interior/inventory evidence**

These files go to private Supabase Storage. The Seller can see their own files and Commerce Admin can review them. Another normal account must not be able to read them.

### Capture location

1. Click **Capture current location**.
2. Allow location access in the browser or device prompt.
3. Confirm the button changes to **Location captured**.

Location supports Seller verification and future pickup operations. If the device does not expose location, the page explains that location is unavailable. The current form stores coordinates when captured.

### Submit

1. Click **Submit seller application**.
2. Expect a submitted message.
3. The form becomes **Application locked for review**.
4. Return to Creator Commerce and confirm Seller shows Submitted or Under review.

Why it locks: the Admin must review the same evidence and answers that were submitted. If Admin chooses Request info, the Seller can edit and resubmit.

## 6 Admin Seller Approval

1. Sign out from the applicant account.
2. Sign in as `admin@gmail.com` using the separately provided password.
3. Open **Wallet** → **Open profile** → **Creator Commerce**.
4. Click **Admin review**.
5. Confirm the page title is **Commerce admin**.
6. Click **Refresh applications** if the new application is not visible.
7. Find the Seller card by store name and User ID.
8. Confirm Seller type, registered state, and GSTIN or PAN.
9. For every evidence card, click **View** for an in-page preview or **Open** for the secure document. **Copy path** copies the storage path only.

Available actions depend on the current state:

- **Under review** marks active review.
- **Approve** activates Seller access and provisions the Seller storefront.
- **Request info** requires a reason and returns the form to the Seller.
- **Reject** requires a reason.
- **Suspend** appears for an approved application and requires a reason.
- **Reinstate** appears for a suspended application.

Success after approval:

- The application card shows Approved.
- The applicant's Seller status becomes Approved after refresh.
- **Seller tools** becomes available.
- Approved Seller access is also checked by Supabase when the Seller saves or submits products.

## 7 Registering a Creator

1. Sign in with the Creator account.
2. Open Creator Commerce.
3. Click **Become a Creator**.
4. Confirm the page title is **Creator onboarding**.
5. Enter **Category or niche**.
6. Enter **About**.
7. Enter the **Instagram handle** if available.
8. Enter the **YouTube handle** if available.
9. Enter **Identity name**.
10. Click **Government identity evidence** and choose an image or video.
11. Click **Submit creator application**.

The application locks during Admin review. Admin uses the same Commerce Admin page and can place it Under review, Approve it, Request info, Reject it, Suspend it, or Reinstate it when the current state allows that action.

After approval, the Creator status card shows Approved and **Creator tools** opens the Creator Commerce workspace.

## 8 Professional Verification

Professional verification is an additional credential layer. It does not create Creator access by itself and does not remove Creator access while credentials are under review.

An approved Creator can:

1. Open Creator Commerce.
2. Click **Apply for Professional Verification**.
3. Choose the professional category **Doctor**, **Lawyer**, or **Other**.
4. Enter **Professional title**.
5. Enter **Degree**.
6. Enter **Institution**.
7. Enter **Year**.
8. Enter **Registration/license number**.
9. Upload **Credential document**.
10. Upload **Supporting document**.
11. Click **Submit Professional Verification**.

A new applicant can also reveal the professional section with **Also apply for Professional Verification** and submit Creator and Professional information together. They remain two separate Admin decisions.

Admin reviews the credentials in **Commerce admin**. A verified badge or capability appears only after Admin approval.

## 9 Seller Product Studio

Use the approval-controlled Product Studio for Creator Commerce products:

1. Sign in with an approved Seller.
2. Open Creator Commerce.
3. Click **Seller tools**.
4. Confirm the title is **Seller product studio**.

### New product fields

- **Title** — the product name.
- **Slug** — the URL-safe name. It is generated from the title but can be edited.
- Category buttons — **Wellness**, **Home**, **Travel**, and **Everyday**.
- **Price ₹** — normal selling price in rupees.
- **Sale price ₹** — optional discounted price in rupees; it cannot be above the normal price.
- **Inventory** — stock available.
- **SKU** — the Seller's unique stock code.
- **Description**
- **Creator promotion enabled** — allows approved Creators to promote the product.
- **Creator commission %** — valid range is 5 to 70 when promotion is enabled.
- **Return window days** — valid backend range is 0 to 30.

### Buttons and states

- **Save product draft** stores the product but does not publish it.
- **Edit** loads an editable Draft, Changes required, or Rejected product into the form.
- **Cancel edit** clears the edit form.
- **Submit for approval** sends an editable product to Admin.
- **Open advanced media studio** opens the web-only Seller Central at `/seller`.

Each product card shows its product state, approval state, effective price, available inventory, commission, SKU, return window, review note, and **Media X/10**.

An Approved, Submitted, or Under review product cannot be edited from this approval-controlled form. This prevents a reviewed product from changing silently.

## 10 Creator Commission in Simple Numbers

The Seller chooses a percentage from 5% to 70% when **Creator promotion enabled** is on.

Example:

- Product sale amount: ₹1000
- Creator commission: 20%
- Commission record: ₹200

The percentage is saved as part of the promotion and order record. If the Seller changes the product to 10% tomorrow, yesterday's eligible ₹200 record does not become ₹100.

The ₹5 platform fee is separate. It is charged once on the complete checkout, not once per product and not used as the Creator commission base.

## 11 Advanced Media Studio

The Advanced Media Studio is the existing web-only Seller Central. Open it from **Seller Product Studio** by clicking **Open advanced media studio**. Its route is `/seller`.

The real sidebar has exactly seven items.

### Overview

Shows:

- Launch-readiness health score.
- Live product count.
- Total inventory units.
- SEO and AI coverage.
- Commerce posture.
- Storefront status, catalog health, and search readiness.
- Store performance, visitors, orders, conversion, revenue, and payment mix when data exists.

The visible **Add product** button switches to Catalog. The bell and account controls are visible, but notification and account-menu workflows are not completed in this screen.

### Storefront

The **Storefront builder** contains:

- Legal name
- Storefront name
- Storefront slug
- Tagline
- Store description
- Business type
- Seller tier using `local` or `gst`
- Primary category
- State code
- City
- Support phone
- Support email
- Address
- GSTIN optional for this older studio form

It also shows a live metadata preview. Click **Save storefront** for an existing store. **Create seller account** appears only when no storefront exists. Creator Commerce onboarding remains the approved route for a new Seller.

### Catalog

The **Catalog and inventory** section contains:

- Product title
- Product slug
- Brand
- Category
- Price in paise
- Inventory
- SKU
- Short description
- Product description
- Tags separated by commas
- Search keywords separated by commas
- Media picker
- Catalog inventory table

Price here is in paise, so ₹999 is `99900`.

For an existing Creator Commerce product:

1. Click its row in **Catalog inventory**.
2. Confirm the correct product appears in the form.
3. Click **Add 1 to 10 product images**.
4. Choose 1 to 10 JPEG, PNG, WebP, or GIF files.
5. Confirm the selected count and thumbnails appear.
6. Click **Update product**.
7. Return to `/commerce/seller` and confirm **Media 1/10** or the expected count.
8. Admin can confirm the same thumbnails in **Product approval queue**.
9. The approved product's first image appears on the public storefront and product page.

For a new Catalog entry, the button reads **Publish product**. In the current Creator Commerce process, use Seller Product Studio to create the approval-controlled draft first and use Advanced Media Studio mainly for media and extended metadata.

Media is limited to 10 images. The current screen shows selected thumbnails, but it does not expose separate reorder or remove buttons for individual saved images. Selecting media and updating replaces the product media list. Do not look for controls that are not present.

Security in plain English:

- The Seller can upload only into a path belonging to the Seller's own storefront and product.
- Admin can see media during review.
- Public visitors can read media only through live approved products.
- Another Seller cannot write to this Seller's media records or storage path.

The previously found `0/10` media permission problem is fixed in the live project. The fix uses the real Storage ownership field `owner_id` and an explicitly qualified `storage.objects.name` path inside the RLS rules. Seller upload, Admin preview, and public image loading were retested successfully.

### Orders

Shows the broader Seller Central order queue with Order, Customer, Total, Fulfilment, and Action columns. Click an order or **Manage** to open the fulfilment modal. The modal displays status choices plus Carrier, Tracking number, Package reference or SKU bundle, and Customer delivery note, with **Cancel** and **Save fulfilment**.

For the Creator Commerce acceptance flow, use **Seller product studio** → **Seller fulfillment**, because that section exposes the current backend-enforced next-state buttons and packing evidence.

### Business chat

Shows an Inbox, customer conversations, All, Unread, and Orders labels, a conversation thread, and a reply box. Selecting a real conversation and sending a text reply is connected to the repository. Search text, filters, and phone/video icons are currently presentation controls without completed actions.

### SEO & AI

Contains:

- SEO title
- SEO description
- LLM storefront summary
- **Publish crawlable pages** switch
- **Enable GEO summaries** switch
- Discoverability guidance
- Programmatic page inventory
- Search preview
- **Save discoverability settings**

Public URLs use `/store/{storefront-slug}` and `/store/{storefront-slug}/product/{product-slug}`. The pages include metadata and structured data for search and model-readable discovery.

### Operations

Shows the support email, phone, city, state, storefront state, product count, inventory, and SEO coverage. This is a readiness summary. It does not currently contain a live bank payout or courier-provider connection.

## 12 Admin Product Approval

1. Seller opens **Seller product studio**.
2. Seller clicks **Submit for approval** on the correct draft.
3. Admin signs in and opens **Creator Commerce** → **Admin review**.
4. Scroll to **Product approval queue**.
5. Use the round refresh button in that panel if needed.
6. Confirm title, store, price, state, commission, available inventory, SKU, return window, description, and Media count.
7. Click a media thumbnail to open it.
8. Enter **Reason / notes** when the selected decision needs an explanation.

Buttons depend on state:

- Submitted: **under review**, **Approve live**, **changes required**, or **rejected**.
- Under review: **Approve live**, **changes required**, or **rejected**.
- Approved: **suspended** only.
- Suspended: **Reinstate**.

There is intentionally no Approve button on an already Approved product. Approval changes it to the live product state. Suspension removes it from the live shop and Creator marketplace.

## 13 Creator Product Marketplace

1. Sign in with an approved Creator.
2. Open Creator Commerce.
3. Click **Creator tools**.
4. Confirm the title is **Creator commerce workspace**.
5. Find **Creator product marketplace**.

Each approved promotable product shows:

- Product title
- Storefront name
- Current selling price
- Creator commission percentage
- Available inventory
- Return window
- Buyer link after promotion

Only products that are active, Admin Approved, and enabled for Creator promotion appear here.

## 14 Promoting a Product

1. Find the approved product.
2. Click **Promote**.
3. Expect a success message saying the promotion was saved and the tracking code was copied.
4. A buyer link appears in this form:

```text
/commerce/buyer?ref=TRACKING_CODE
```

5. The button changes to **Refresh promotion**.

Refreshing does not create duplicate relationships. The database allows one promotion for one Creator and one product. It reuses that relationship and keeps the tracking record stable for this flow.

## 15 How Last Click Attribution Works

When a signed-in Buyer opens a creator link, the app records a click for that Buyer and product. The default window is seven days.

If the Buyer later opens a valid link for the same product from another Creator, the latest valid click is used when the product enters the cart. Earlier click history stays in the database for audit and analysis.

Why use last click: the most recent active referral is treated as the final promotion that led to the cart action. The rule is calculated by the backend, not trusted from page text.

## 16 Cart and Multiple Sellers

The Creator Commerce cart is available in both **Creator commerce workspace** and **Buyer commerce**.

Buyer buttons are:

- **Add to cart**
- **Add one**
- **Remove one**
- **Remove**

The cart can contain products from multiple Sellers. The Buyer sees one cart and creates one checkout group. The backend creates a separate Seller order for each storefront so each Seller sees and fulfils only their own part.

The existing **Shop** tab has a separate bag UI. Its **Continue to checkout** still says checkout is not wired. Use Creator Commerce Buyer marketplace for the implemented internal lifecycle.

## 17 Checkout

In **Buyer commerce**, scroll to **Cart and checkout** and complete:

- Recipient name
- Phone
- Address
- City
- State
- Postal code

Then choose:

- **Checkout external** — creates an external-payment-pending checkout. No real Razorpay payment is attempted.
- **Checkout COD** — creates a COD order only when Buyer KYC is Verified.

At checkout the backend rechecks:

- Current price and sale price
- Available inventory
- Product is active and Admin Approved
- Seller remains valid
- Delivery state for a Non-GST Seller
- Current valid creator attribution
- ₹5 platform fee
- COD KYC

The product page is not trusted because price, stock, approval, or access may have changed since it loaded.

## 18 The ₹5 Platform Fee

The default fee is ₹5, stored as 500 paise. It is added once to the unified checkout.

Example:

- Product subtotal: ₹900
- Platform fee: ₹5
- Checkout total: ₹905

It is not charged once per Seller or once per product.

## 19 Buyer KYC

KYC means Know Your Customer. In the current rules, it is required for COD.

There is no Buyer self-verification screen in the current app. A Buyer cannot mark themselves Verified.

For development testing only:

1. Admin opens **Commerce admin**.
2. Scrolls to **Checkout, KYC, and returns test controls**.
3. Finds **Buyer KYC test review** and the Buyer's User ID.
4. Uses **submitted**, then **under review**, then **verified**.

These buttons work only for Commerce Admin while backend test mode is enabled. A production release needs a real KYC provider to collect documents, perform verification, and return a signed result.

## 20 GST and Non-GST Delivery Rules

- An approved GST Seller is treated as eligible for pan-India checkout in the current internal rule.
- A Non-GST Seller can deliver only when the Buyer's delivery state matches the Seller's registered state.

The checkout rejects a mismatched state with a clear message. This is a backend eligibility rule, not merely a label in onboarding.

## 21 Seller-Specific Orders

After a valid checkout:

- One checkout group belongs to the Buyer.
- One child order is created for each Seller storefront represented in the cart.
- Each child order contains only that Seller's items.
- The Buyer can see all their order items.
- A Seller can see orders for their own storefront.
- Another Seller cannot see or update those private orders because RLS and storefront ownership checks protect them.

## 22 Seller Fulfilment

1. Sign in as the approved Seller.
2. Open Creator Commerce → **Seller tools**.
3. Scroll to **Seller fulfillment**.
4. Find the correct order by its short Order ID.
5. Follow only the next button shown:

```text
placed → confirmed → processing → shipped → out for delivery → delivered
```

The backend prevents skipping from Placed directly to Shipped or Delivered. External-payment orders cannot start fulfilment until payment has been confirmed.

When Delivered is recorded, the return-window end date is calculated and an attributed pending Creator commission becomes Confirmed.

## 23 Packing Evidence

Packing evidence is implemented in the Seller Product Studio.

1. In **Seller fulfillment**, find the order.
2. Click **Submit packing evidence**.
3. Choose an image or video.
4. Expect **Private packing evidence uploaded and persisted**.
5. The evidence card appears with **View**.
6. The button changes to **Replace packing evidence**.

The file is private. The Seller, authorized order participants where permitted, and Admin can access the relevant record. It is not a public product image.

## 24 Unboxing Evidence

Unboxing evidence is implemented in **Buyer commerce**.

1. Sign in as the Buyer who owns the order.
2. Open Creator Commerce → **Buyer marketplace**.
3. Scroll to **Buyer orders and returns**.
4. Wait until the order shows Delivered.
5. Click **Submit unboxing evidence**.
6. Choose an image or video.
7. Expect **Private unboxing evidence uploaded and persisted**.
8. The evidence remains after refresh and the button becomes **Replace unboxing evidence**.

The backend checks that the file owner is the Buyer for that order item. Another Buyer cannot attach evidence to this order.

## 25 Returns and Refunds

1. In **Buyer orders and returns**, enter a Return reason.
2. Ensure the order is Delivered and still inside its return window.
3. Click **Submit return request**.
4. Expect the order to become `return_requested` and commission to become Withheld.
5. Admin opens **Commerce admin** → **Checkout, KYC, and returns test controls** → **Return requests**.
6. Admin can enter an **Admin note** and click **Approve return** or **Reject return**.

If Admin approves:

- A refund request is created with external integration pending.
- The Creator commission becomes Reversed.
- No real money is sent back yet because a refund provider is not connected.

If Admin rejects:

- A withheld Creator commission returns to Confirmed.

## 26 Creator Commission Lifecycle

Current commission states include:

- **Pending** — attributed checkout exists but delivery is not complete.
- **Confirmed** — delivery was recorded.
- **Withheld** — a return request is open.
- **Reversed** — an approved return removed the commission.
- **Eligible** — backend test release or a future scheduled release has passed the return window.
- **Payable** and **Paid** are modelled for the future payout process.

The current UI shows commission records in **Creator commerce workspace** → **Creator commissions**. It shows the product, status, commission amount, and eligible item amount.

Refreshing the page does not create another commission. The database permits one commission row per order item.

## 27 Creator Earnings Are Accounting Records

The commission list proves attribution and calculates what the Creator may earn. It is not the same as a withdrawable Wallet balance.

Current state:

- Commission accounting and lifecycle are implemented.
- Creator bank payout is not connected.
- There is no visible **Withdraw** or commission payout button.
- A production payout provider, bank account onboarding, settlement schedule, tax handling, and reconciliation are still required.

## 28 Wallet Connection

Wallet currently acts as the path to Profile and Creator Commerce. The Wallet screen itself says it is ready for a future payment step.

Creator commissions do not currently enter the normal Wallet balance. Do not demonstrate a commission as cash already received.

## 29 What Is Live and What Still Needs a Provider

| Area | Current status |
|---|---|
| Supabase Auth and protected routes | Working |
| Seller Creator and Professional approval | Working |
| Private application evidence | Working |
| Product draft and Admin approval | Working |
| Product media upload and public display | Working and retested after RLS fix |
| Creator promotion and tracking code | Working |
| Last-click attribution | Working |
| Cart and multi-Seller order split | Working internally |
| ₹5 backend fee | Working internally |
| COD KYC rule | Working |
| Seller self-fulfilment state machine | Working |
| Packing and unboxing evidence | Working |
| Return decision and commission reversal | Working |
| Real Razorpay collection | External provider integration pending |
| Automatic production KYC | External provider integration pending |
| Courier or 3PL labels and tracking | External provider integration pending |
| Real refund settlement | External provider integration pending |
| Creator bank payout | External provider integration pending |

## 30 Complete Client Demonstration Scenario

This scenario uses the existing approved product **Manual Test Product**. Do not create it again unless test data has been reset.

### A Confirm the Seller product

1. Sign in as `naveen.qa24@gmail.com`.
2. Open Wallet → Open profile → Creator Commerce → Seller tools.
3. Find **Manual Test Product**.
4. Confirm it shows Approved, the expected inventory, commission, return window, and Media count.

### B Confirm media

1. Click **Open advanced media studio**.
2. Click **Catalog**.
3. Click the **Manual Test Product** row.
4. Confirm its current image count in the approval-controlled Product Studio after returning.
5. Do not replace the image during a client demo unless that change is intentional.

### C Promote as Creator

1. Return to Creator Commerce.
2. Click **Creator tools**.
3. Find **Manual Test Product**.
4. Click **Refresh promotion** if the promotion already exists, otherwise **Promote**.
5. Copy the exact buyer link shown.

### D Buy from the creator link

1. Sign out from Naveen.
2. Sign in as `yogesh.qa24@gmail.com`.
3. Open the exact creator buyer link.
4. Expect **Creator attribution recorded for this buyer session**.
5. Click **Add to cart** on Manual Test Product.
6. Confirm the cart says **Creator attributed**.
7. Use these safe sample values:

```text
Recipient name
Vamshi Test Buyer

Phone
9000000000

Address
101 Test Street

City
Bengaluru

State
KARNATAKA

Postal code
560102
```

8. Click **Checkout external**.
9. Expect a checkout with `external_payment_pending` and `external_integration_pending`.

### E Confirm test payment

1. Sign out from Yogesh.
2. Sign in as Admin.
3. Open Creator Commerce → Admin review.
4. Scroll to **External checkouts**.
5. Find the new checkout by Buyer ID and amount.
6. Click **Confirm test payment**.
7. Expect the Seller order to become Placed.

This is a development test control, not a real payment.

### F Fulfil the order

1. Sign out from Admin.
2. Sign in as Naveen.
3. Open Seller tools → Seller fulfillment.
4. Attach packing evidence with **Submit packing evidence** if required for the demonstration.
5. Click the next available status in order: confirmed, processing, shipped, out for delivery, delivered.
6. Confirm no skip button is offered.

### G Return the order

1. Sign out from Naveen.
2. Sign in as Yogesh.
3. Open Buyer marketplace → Buyer orders and returns.
4. Confirm Delivered and the return-until date.
5. Click **Submit unboxing evidence** and attach a safe test file.
6. Enter:

```text
Manual QA return request for delivered test order
```

7. Click **Submit return request**.
8. Expect `return_requested` and commission Withheld.

### H Approve the return

1. Sign in as Admin.
2. Open Admin review → Return requests.
3. Find the request and click **Approve return**.
4. Explain that the refund record is created but real provider settlement is pending.
5. Sign in as Naveen and open Creator tools → Creator commissions.
6. Confirm the commission for that returned item is Reversed.

# What We Completed

- [x] Seller registration
- [x] GST and Non-GST Seller handling
- [x] Creator registration
- [x] Professional verification
- [x] Admin approval
- [x] Product creation 
- [x] Product media
- [x] Product approval
- [x] Creator commission configuration 
- [x] Creator product promotion 
- [x] Product attribution
- [x] Cart
- [x] Checkout logic
- [x] Multi-Seller order splitting
- [x] Seller orders
- [x] Fulfilment state machine
- [x] Packing and unboxing evidence
- [x] Returns
- [x] Creator commission lifecycle
- [x] Storage security
- [x] Cross-user permissions
- [x] Product media RLS fix and live retest

External integrations prepared but provider connection may still be required:

- Razorpay or another real payment provider
- Automated KYC provider
- Courier or 3PL provider
- Real refund settlement
- Real Creator bank payout
