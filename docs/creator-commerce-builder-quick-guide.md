# Creator Commerce
## 5 Minute Builder Quick Guide

## 1 Creator Commerce in 30 Seconds

```text
User -> Seller / Creator / Professional capabilities
Seller -> Storefront -> Product -> Media -> Admin Approval -> Live Product
Creator -> Finds Product -> Promotes Product -> Promotion Tracking
Buyer -> Product -> Cart -> Checkout -> Order
Seller -> Fulfilment
Buyer -> Return if needed
Creator -> Commission
```

Capabilities are independent, so one account can hold Seller, Creator, and Professional roles. Sellers own storefronts and products; Admin approval controls availability. Creators reference approved Products instead of copying them. Checkout snapshots attribution and commission into Seller-specific orders. Payment, KYC, courier, refunds, and payouts still need real providers.

## 2 Commerce Home

Screen: `/commerce`

- **Seller** - Selling capability; Approved unlocks **Seller tools** at `/commerce/seller`; independent from Creator and Professional.
- **Creator** - Promotion capability; Approved unlocks **Creator tools** at `/commerce/creator`.
- **Professional** - Separate credential layer; it does not replace Creator approval.
- **Buyer KYC** - Server-owned identity state used by the COD gate.
- **Become a Seller / Become a Creator / Apply for Professional Verification** - Opens matching onboarding.
- **Buyer marketplace** - Opens `/commerce/buyer` for cart, checkout, orders, evidence, and returns.
- **Seller tools** - Opens the approval-controlled Product Studio.
- **Creator tools** - Opens promotion, checkout test surfaces, and commissions.
- **Admin review** - Opens `/commerce/admin` only with Commerce Admin access.
- **Refresh commerce status** - Reloads capability state from Supabase.

## 3 Seller Product Studio

Screen: `/commerce/seller`

- **Open advanced media studio** - Opens web-only Seller Central at `/seller`.
- **Title** - Product display name.
- **Slug** - URL-safe product identifier.
- **Wellness / Home / Travel / Everyday** - Current category choices.
- **Price ₹** - Regular price entered in rupees.
- **Sale price ₹** - Optional effective price; cannot exceed regular price.
- **Inventory** - Total stock; the card shows available stock after reservations.
- **SKU** - Seller-side inventory identifier.
- **Description** - Shared product copy used in review and commerce surfaces.
- **Creator promotion enabled** - Controls whether approved Creators can promote the Product.
- **Creator commission %** - Attributed share; valid range is 5-70% when enabled.
- **Return window days** - Post-delivery return period; backend range is 0-30 days.
- **Save product draft** - Persists without entering Admin review.
- **Edit** - Loads Draft, Changes required, or Rejected data into the form.
- **Submit for approval** - Moves an editable Product into Product Approval Queue.
- **Media X/10** - Persisted media count shared with Advanced Seller Studio.
- **Submit / Replace packing evidence** - Stores private order packing evidence.
- **Fulfilment state buttons** - Expose only the next valid order transition.

## 4 Advanced Seller Studio

Screen: `/seller` - exact live sidebar labels below.

### Overview

**Purpose:** Store health, products, inventory, SEO, visitors, orders, revenue, conversion, and payment mix.  
**Used for:** A readiness scan. **Connected to:** Storefront, Catalog, Shop, and analytics.  
**Important controls:** Health card and **Add product**. Notification and account icons are not wired here.

### Storefront

**Purpose:** Public identity: names, slug, tagline, description, tier, category, location, support, address, and GSTIN.  
**Used for:** `/store/{slug}` and delivery context. **Connected to:** Product ownership, checkout, analytics.  
**Important controls:** **Save storefront**; **Create seller account** appears only before setup.

### Catalog

**Purpose:** Product collection with SKU, paise price, stock, copy, tags, keywords, and media.  
**Used for:** Product presentation and images. **Connected to:** Admin, Creator marketplace, Shop, Storefront.  
**Important controls:** **Add 1 to 10 product images**, **Publish product**, **Update product**, **Catalog inventory**. ₹999 is `99900` paise.

### Orders

**Purpose:** Order queue with customer, total, fulfilment, carrier, tracking, package, and delivery note.  
**Used for:** Operations. **Connected to:** Seller orders and customer timeline.  
**Important controls:** **Refresh orders**, **Manage**, **Save fulfilment**. Use `/commerce/seller` for strict transitions and packing evidence.

### Business chat

**Purpose:** Storefront customer inbox. **Used for:** Product and order support.  
**Connected to:** Storefront conversations. **Important controls:** Select and reply. Search/filter, phone, and video controls are presentation-only.

### SEO & AI

**Purpose:** SEO title, description, LLM summary, crawlability, GEO, URLs, and preview.  
**Used for:** Machine-readable pages. **Connected to:** Public metadata and JSON-LD.  
**Important controls:** **Publish crawlable pages**, **Enable GEO summaries**, **Save discoverability settings**.

### Operations

**Purpose:** Support profile and commerce-readiness summary.  
**Used for:** Checking Storefront, Product, stock, contact, and SEO.  
**Connected to:** Seller data; no payout or courier provider is connected.  
**Important controls:** Read-only operational summary.

### Catalog vs Product vs Storefront vs Media

| Term | What it is | Example |
|---|---|---|
| Storefront | Seller-owned public business page and ownership boundary | Social24 Test Store |
| Catalog | Management view of every Product in that Storefront | Its two inventory rows |
| Product | One sellable approved item | Manual Test Product |
| Media | Ordered images attached to one Product | Product cover PNG |

### Media Studio

- **Media 1/10** means one persisted asset is attached out of ten allowed.
- The picker accepts 1-10 images; no saved-item reorder or individual remove control is visible.
- Seller upload -> Seller-owned Storage object -> `product_media` association -> Admin preview -> approved public Product image.
- The first attached item becomes the cover path; Product Studio, Admin, and public pages use the same Product source.
- Product media is public only for live approved Products; verification and order evidence use private Storage.

## 5 Admin Product Review

Screen: `/commerce/admin`

- **Product approval queue** is the authoritative review surface for Seller-submitted Products.
- Seller capability approval authorizes selling; Product approval separately authorizes one listing and its media.
- **changes required** returns the Product to a Seller-editable state with review notes.
- **Approve live** moves Product approval to Approved and Product status to Active.
- Active Approved promotion-enabled Products appear to Creators and Buyers.
- **suspended** removes live and promotion availability without deleting history.
- Media is shown because Admin reviews the same visual source used publicly.
- The page also contains application review plus **Checkout KYC and returns test controls** for non-production lifecycle verification.

## 6 Creator Workspace

Screen: `/commerce/creator`

- **Creator product marketplace** - Approved promotable Products; **Promote / Refresh promotion** creates or reuses the relationship.
- **Cart and checkout** - Combined Creator/buyer test surface with address, ₹5 fee, **Checkout external**, and **Checkout COD**.
- **Buyer orders and returns** - Purchased items and return action; one account may also be a Buyer.
- **Checkouts** - Internal checkout/payment state history.
- **Creator commissions** - Product, commission status, amount, and eligible item value for attributed order items.

Creators see Products only when Active, Approved, and promotion-enabled. **Promote** creates one tracking relationship, not a Product copy; Seller still controls price, stock, media, and availability. `/shop` is the existing consumer catalog, while `/commerce/buyer` is the implemented Creator Commerce Buyer flow.

## 7 Promotion and Attribution

**Promotion** is a Creator-Product relationship with a tracking code. **Last Click** means Buyer opens Creator A, then Creator B for the same Product; B becomes current attribution while both clicks remain in history. Cart stores the chosen promotion; Order Item snapshots preserve credit after later changes.

## 8 Cart Checkout and Order Splitting

A multi-Seller cart creates one `checkout_group`, then one `order` per Storefront with correct `order_items`. RLS lets each Seller see only its order.

Checkout revalidates price, stock, Seller, Active + Approved state, promotion, and delivery. Fee is **₹5 once per checkout**. **COD requires Verified Buyer KYC**. GST Sellers are pan-India eligible; Non-GST Sellers are same-state only.

## 9 Fulfilment Returns Commission

```text
Placed -> Confirmed -> Processing -> Shipped -> Out for Delivery -> Delivered
Delivered -> Return window -> Return request when applicable
Commission: Pending -> Confirmed -> Eligible -> Payable -> Paid
Return branch: Confirmed -> Withheld -> Reversed or restored to Confirmed
```

Delivered starts the return window and confirms commission. Return submission withholds it; approval reverses it. `Eligible`, `Payable`, and `Paid` exist, but payout is not connected.

Example: ₹1000 at 20% creates ₹200. A later change to 10% does not rewrite that snapshot.

## 10 What Important Buttons Actually Change

| Button | What it changes | Next result |
|---|---|---|
| Save product draft | Product fields in Draft | Editable Product card |
| Submit for approval | Approval state to Submitted | Admin queue actions unlock |
| Approve live | Approval Approved plus status Active | Creator/Buyer visibility |
| Open advanced media studio | Route only | `/seller` Catalog/media tools |
| Update product | Catalog metadata and selected media | Shared Product source refreshes |
| Promote | Creator-Product relationship | Buyer tracking link |
| Refresh promotion | Reuses/reactivates same relationship | No duplicate promotion |
| Add to cart | Buyer Product quantity plus attribution | Checkout-ready cart line |
| Checkout external | Checkout/payment pending records and Seller drafts | Admin test confirmation or future provider |
| Checkout COD | KYC-gated placed checkout | Seller order becomes fulfilment-ready |
| Fulfilment next state | Order, fulfilment, and event rows | Next valid state button |
| Submit return request | Return row and commission Withheld | Admin return decision |

## 11 Current External Boundaries

| Function | What we built | Still needs provider |
|---|---|---|
| Razorpay | Checkout, payment attempt, test capture, order gate | Live order, signature/webhook, capture, refund |
| Automated KYC | Server-owned state and COD gate | Identity collection and verified result |
| 3PL courier | Seller state machine and tracking fields | Shipment, label, scans, webhooks |
| Bank payout | Commission ledger states | Creator onboarding, settlement, reconciliation |
| Google Business verification | No current integration | Only if product later requires it |

## 12 Important Technical Things to Remember

- Seller, Creator, Professional, KYC, and Admin are independent capabilities.
- Products remain Seller-owned when promoted; promotion stores a reference.
- Last valid click selects Creator attribution; click history remains.
- Commission percentage and amount are snapshotted at checkout.
- One multi-Seller checkout becomes Storefront-specific orders.
- Checkout revalidates money, stock, approval, Seller, attribution, and delivery.
- RLS and RPC checks, not hidden buttons, protect cross-user data and transitions.
- Private verification/order evidence is separate from public approved Product media.
- Storage media ownership uses `owner_id`.
- Product Storage policy explicitly qualifies `storage.objects.name`.

## 13 Recent Important Bug

Media upload failed from an old ownership field and ambiguous `name`. The fix uses `owner_id` and `storage.objects.name`. Seller upload, Admin preview, and approved public media work; cross-user upload stays blocked.

## 14 Two Minute Demo Script

1. **Commerce Hub** - “These independent capabilities control Seller, Creator, Professional, KYC, and Admin access.”
2. **Seller Tools** - “This Studio owns commercial fields, commission, return window, and the Product approval lifecycle.”
3. **Create Product** - “Save keeps a Draft; Submit sends the same Product to Admin.”
4. **Media** - “Advanced Catalog attaches Seller-owned media to that shared Product.”
5. **Admin Approval** - “Approve live makes Active Approved content available to Creators and Buyers.”
6. **Creator Marketplace** - “Creator sees Seller-controlled price, stock, media, and commission offer.”
7. **Promote** - “Promotion creates a stable Creator-Product tracking relationship, not a copy.”
8. **Cart** - “Last valid Creator click is stored with the Buyer line.”
9. **Checkout** - “Backend revalidates the deal, adds ₹5 once, and splits orders by Storefront.”
10. **Fulfilment** - “Seller advances only through the enforced delivery chain.”
11. **Return** - “A return withholds commission; approval reverses it and creates a pending refund record.”
12. **Commission** - “The checkout snapshot preserves historical Creator economics while payout remains external.”

## Small FAQ

### What is the difference between Storefront Catalog Product and Media
Storefront is the public business and ownership boundary. Catalog manages its Products. Product is one sellable record; Media is its image set.

### Why does Creator promotion reference instead of copy the Seller Product
A reference keeps one source for price, stock, media, approval, and availability.

### How exactly does Last Click attribution work
The newest valid click is attached to cart. Earlier clicks remain; checkout snapshots the selected click and Creator.

### Why snapshot Creator commission
Later Seller changes must not rewrite the purchase-time commission.

### Why split one checkout into Seller-specific orders
Each Seller needs an isolated fulfilment, return, and RLS boundary.

### Why revalidate Product data at checkout
Cart facts can become stale; checkout is the authoritative transaction boundary.

### How can one account be Seller Creator and Professional
Separate capability fields unlock each role independently.

### Which parts still need external providers
Real payment/refund, automated KYC, courier events, and Creator bank settlement.

### How is Product media security different from verification documents
Approved Product media is publicly readable and Seller-owned for writes. Verification and order evidence stay private and use authorized signed URLs.

### What happens when Product or Seller is suspended
Protected Seller operations close when Seller capability is not Approved. Suspended Product is no longer Active + Approved, so live queries, promotion clicks, and checkout reject it while history remains.
