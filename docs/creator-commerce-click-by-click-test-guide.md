# HOW TO START TESTING

> Verified status on 2026-08-08: the real product, promotion, attribution, cart, external test checkout, admin KYC, fulfilment, private packing/unboxing evidence, return, refund-pending, commission reversal, and cross-user RLS flows were exercised in the browser against Supabase project `nqwhmmigtbhrmmdvwzms`. Product media is the only known blocked retest: the current backend rejects `shop-media` uploads until migration `20260808092821_fix_creator_commerce_storefront_product_flow.sql` is applied. For the short acceptance pass, use `docs/creator-commerce-final-manual-retest.md`.

## 1. Start the app

COPY and PASTE this in Terminal:

```bash
cd /Users/vamshipendyala/Desktop/july28drchiag-creator-commerce-auth
npm run web
```

Current running local port observed for this worktree/browser session:

```text
http://localhost:8098
```

If Expo chooses a different port, use the URL printed in Terminal after it starts. Look for a line like:

```text
Web is waiting on http://localhost:XXXX
```

Replace `8098` in every URL below with that printed port if needed.

## 2. URLs to open

LOCAL URL:

```text
http://localhost:8098
```

COMMERCE URL:

```text
http://localhost:8098/commerce
```

ADMIN URL:

```text
http://localhost:8098/commerce/admin
```

SELLER URL:

```text
http://localhost:8098/commerce/seller
```

CREATOR URL:

```text
http://localhost:8098/commerce/creator
```

SHOP URL:

```text
http://localhost:8098/shop
```

CHECKOUT URL:

```text
No standalone checkout route exists right now.
Checkout is inside http://localhost:8098/commerce/creator in the "Cart and checkout" section.
```

# ACCOUNTS I NEED

Supabase project:

```text
nqwhmmigtbhrmmdvwzms
```

Important: do not put passwords in this guide, source code, screenshots, or comments.

## ADMIN

ROLE:

```text
ADMIN
```

EMAIL:

```text
admin@gmail.com
```

CURRENT STATUS:

```text
Current browser session can open /commerce/admin.
Current /commerce screen for this signed-in account shows:
Seller: Not Applied
Creator: Not Applied
Professional: Not Applied
Buyer KYC: Not Submitted
```

WHY I NEED THIS ACCOUNT:

```text
Use this account to approve seller applications, creator applications, professional verification, and product approvals.
```

## APPROVED SELLER

ROLE:

```text
APPROVED SELLER
```

EMAIL:

```text
naveen.qa24@gmail.com
```

CURRENT STATUS:

```text
Current admin UI shows an approved Seller Application named "Social24 Test Store" for user 272d8b05-da97-4d4c-8294-be45b7958ec9.
The current admin UI does not display the email beside this user id, so confirm this email in Supabase Auth before testing if login does not open Seller Product Studio.
```

WHY I NEED THIS ACCOUNT:

```text
Use this account to open /commerce/seller, create a product draft, submit the product for admin review, and update order fulfilment status.
```

## APPROVED CREATOR

ROLE:

```text
APPROVED CREATOR
```

EMAIL:

```text
naveen.qa24@gmail.com
```

CURRENT STATUS:

```text
Current admin UI shows an approved Creator Application named "doctarate" for user 272d8b05-da97-4d4c-8294-be45b7958ec9.
The current admin UI also shows an approved Professional Verification card named "Lawyer" for the same user id.
The current admin UI does not display the email beside this user id, so confirm this email in Supabase Auth before testing if login does not open Creator workspace.
```

WHY I NEED THIS ACCOUNT:

```text
Use this account to open /commerce/creator, promote approved products, add products to cart, create checkout records, request returns, and view creator commissions.
```

## BUYER / NORMAL USER

ROLE:

```text
BUYER / NORMAL USER
```

EMAIL:

```text
yogesh.qa24@gmail.com
```

CURRENT STATUS:

```text
Verified in the live browser as a normal buyer.
Admin test mode moved Buyer KYC through Submitted, Under review, and Verified.
```

WHY I NEED THIS ACCOUNT:

```text
Use this account for creator-attributed buyer links, cart, checkout, delivery evidence, returns, and normal-user access restrictions.
```

## OPTIONAL SECOND SELLER

ROLE:

```text
OPTIONAL SECOND SELLER
```

EMAIL:

```text
MISSING TEST ACCOUNT: OPTIONAL SECOND SELLER
```

CURRENT STATUS:

```text
No clearly confirmed second approved seller is visible in the current admin UI.
```

WHY I NEED THIS ACCOUNT:

```text
Useful for testing that one seller cannot manage another seller's products or orders.
Simplest safe preparation: sign up a new normal user, submit Seller onboarding, then approve that seller from /commerce/admin.
```

## OPTIONAL SECOND CREATOR

ROLE:

```text
OPTIONAL SECOND CREATOR
```

EMAIL:

```text
MISSING TEST ACCOUNT: OPTIONAL SECOND CREATOR
```

CURRENT STATUS:

```text
No clearly confirmed second approved creator is visible in the current admin UI.
```

WHY I NEED THIS ACCOUNT:

```text
Useful for testing creator-specific promotion, commission, and access isolation.
Simplest safe preparation: sign up a new normal user, submit Creator onboarding, then approve that creator from /commerce/admin.
```

## BUYER WITH VERIFIED KYC

ROLE:

```text
BUYER WITH VERIFIED KYC
```

EMAIL:

```text
yogesh.qa24@gmail.com
```

CURRENT STATUS:

```text
Buyer KYC was verified through the Commerce Admin test panel during the live E2E pass.
A normal buyer self-verification attempt was rejected by backend authorization.
```

WHY I NEED THIS ACCOUNT:

```text
COD checkout requires verified buyer KYC. Use the Commerce Admin test controls only in the test environment; production still requires an external KYC provider.
```

# COPY-PASTE DUMMY DATA

## SELLER PRODUCT TEST DATA

```text
Product Name:
Social24 Test Sneakers

Slug:
social24-test-sneakers

Description:
Test product created only for Creator Commerce acceptance testing.

Brand:
Social24 Test

Category:
Everyday

Product Type:
Physical

Price:
1000

Sale Price:
900

SKU:
S24-TEST-001

Stock:
10

Creator Promotion:
Enabled

Creator Commission:
20

Return Window Days:
7
```

Note: the current Seller Product Studio category buttons are:

```text
Wellness
Home
Travel
Everyday
```

There is no visible `Fashion / Footwear` category button in the current Seller Product Studio.

## SELLER ONBOARDING TEST DATA

```text
Legal identity name:
Social24 Test Seller

Store name:
Social24 Manual Test Store

Business name:
Social24 Manual Test Business

Registered state:
KARNATAKA

City:
Bengaluru

Phone:
9000000000

Email:
seller.manual.test@example.com

GSTIN:
27AABCU9355J1ZU

PAN/local seller ID:
ABCDE1234F

Store address:
101 Test Market Road, Bengaluru, Karnataka

Pickup address:
101 Test Market Road, Bengaluru, Karnataka

Return address:
101 Test Return Desk, Bengaluru, Karnataka
```

## CREATOR ONBOARDING TEST DATA

```text
Category or niche:
fitness gear

About:
Manual test creator for Creator Commerce QA.

Instagram handle:
@social24testcreator

YouTube handle:
@social24testcreator

Identity name:
Social24 Test Creator
```

## PROFESSIONAL VERIFICATION TEST DATA

```text
Professional category:
Doctor

Professional title:
Doctor

Degree:
MBBS

Institution:
Social24 Test Medical College

Year:
2020

Registration/license number:
TEST123456789
```

## BUYER ADDRESS TEST DATA

```text
Recipient name:
Vamshi Test Buyer

Phone:
9000000000

Address:
101 Test Street

City:
Bengaluru

State code:
KARNATAKA

Postal code:
560102
```

## NON-GST STATE TEST DATA

```text
Non-GST Seller State:
KARNATAKA

Allowed Buyer State:
KARNATAKA

Blocked Buyer State:
TELANGANA
```

Important: the currently visible approved seller in admin is GST Registered. To test Non-GST state restriction by clicking through the app, prepare and approve a Non-GST seller first.

# CURRENT UI SNAPSHOT TO EXPECT

## /commerce current screen

OPEN:

```text
http://localhost:8098/commerce
```

EXPECTED visible sections:

```text
Creator Commerce
Seller
Creator
Professional
Buyer KYC
Become a Seller
Become a Creator
Seller tools
Creator tools
Admin review
```

Currently observed status for the signed-in browser session:

```text
Seller: Not Applied
Creator: Not Applied
Professional: Not Applied
Buyer KYC: Not Submitted
```

Visible buttons on this page:

```text
Refresh icon
Become a Seller
Become a Creator
Seller tools
Creator tools
Admin review
```

Seller tools is locked unless the signed-in account has approved seller access.

Creator tools is locked unless the signed-in account has approved creator access.

Admin review is locked unless the signed-in account has commerce admin access.

## /commerce/admin current screen

OPEN:

```text
http://localhost:8098/commerce/admin
```

Currently observed approved cards:

```text
Professional Verification: Lawyer / Approved
Creator Application: doctarate / Approved
Seller Application: Social24 Test Store / Approved
```

Currently observed product queue:

```text
No product submissions yet.
```

Visible admin buttons when cards are already approved:

```text
Refresh applications
Open
Copy path
Suspend
```

Visible admin buttons that appear for submitted or under-review applications:

```text
Under review
Approve
Request info
Reject
```

Visible admin buttons that appear for suspended applications:

```text
Reinstate
```

Visible product approval buttons when product submissions exist:

```text
Under review
Approve live
Changes required
Reject
Suspend
```

# FULL CLICK-BY-CLICK TESTING GUIDE

# TEST 1 — Confirm the Commerce homepage

LOGIN AS:

```text
ADMIN
```

OPEN:

```text
http://localhost:8098/commerce
```

CHECK:

```text
Page title says Creator Commerce.
```

CHECK:

```text
You can see Seller, Creator, Professional, and Buyer KYC status cards.
```

CHECK:

```text
You can see Become a Seller.
```

CHECK:

```text
You can see Become a Creator.
```

CHECK:

```text
You can see Seller tools.
```

CHECK:

```text
You can see Creator tools.
```

CHECK:

```text
You can see Admin review.
```

EXPECTED:

```text
The page loads without crashing.
Locked tools stay locked for accounts that do not have the required role.
Admin review opens only for commerce admin accounts.
```

# TEST 2 — Normal user cannot open Admin

LOGIN AS:

```text
BUYER / NORMAL USER
```

OPEN:

```text
http://localhost:8098/commerce/admin
```

EXPECTED:

```text
Normal user should not be allowed to manage admin review.
The app should redirect, block access, or show an access-denied state.
```

IF ADMIN PAGE OPENS FOR A NORMAL USER:

```text
Stop testing and report it as an access-control bug.
```

# TEST 3 — Submit a GST seller application

LOGIN AS:

```text
BUYER / NORMAL USER
```

OPEN:

```text
http://localhost:8098/commerce
```

CLICK:

```text
Become a Seller
```

EXPECTED:

```text
Seller onboarding page opens.
URL should be /commerce/seller-onboarding.
```

CLICK:

```text
GST Registered Seller
```

TYPE IN Legal identity name:

```text
Social24 Test Seller
```

TYPE IN Store name:

```text
Social24 Manual Test Store
```

TYPE IN Business name:

```text
Social24 Manual Test Business
```

TYPE IN Registered state:

```text
KARNATAKA
```

TYPE IN City:

```text
Bengaluru
```

TYPE IN Phone:

```text
9000000000
```

TYPE IN Email:

```text
seller.manual.test@example.com
```

TYPE IN GSTIN:

```text
27AABCU9355J1ZU
```

TYPE IN Store address:

```text
101 Test Market Road, Bengaluru, Karnataka
```

TYPE IN Pickup address:

```text
101 Test Market Road, Bengaluru, Karnataka
```

TYPE IN Return address:

```text
101 Test Return Desk, Bengaluru, Karnataka
```

CLICK:

```text
Government/business document
```

SELECT:

```text
Any fake/non-sensitive test image or PDF.
```

CLICK:

```text
Exterior shop/business evidence
```

SELECT:

```text
Any fake/non-sensitive test image.
```

CLICK:

```text
Interior/inventory evidence
```

SELECT:

```text
Any fake/non-sensitive test image.
```

OPTIONAL CLICK:

```text
Capture current location
```

IF BROWSER ASKS FOR LOCATION PERMISSION:

```text
Allow location only if you are comfortable testing it.
Otherwise skip this step.
```

CLICK:

```text
Submit seller application
```

EXPECTED:

```text
Application status changes to Submitted, Under review, or a locked-for-review state.
The form should no longer behave like a blank new application.
```

# TEST 4 — Submit a Non-GST seller application

LOGIN AS:

```text
OPTIONAL SECOND SELLER, or a fresh normal user
```

OPEN:

```text
http://localhost:8098/commerce
```

CLICK:

```text
Become a Seller
```

CLICK:

```text
Non-GST Seller
```

TYPE IN Legal identity name:

```text
Social24 Non GST Seller
```

TYPE IN Store name:

```text
Social24 Non GST Test Store
```

TYPE IN Business name:

```text
Social24 Non GST Test Business
```

TYPE IN Registered state:

```text
KARNATAKA
```

TYPE IN City:

```text
Bengaluru
```

TYPE IN Phone:

```text
9000000001
```

TYPE IN Email:

```text
non.gst.seller.manual.test@example.com
```

TYPE IN PAN/local seller ID:

```text
ABCDE1234F
```

TYPE IN Store address:

```text
202 Non GST Test Market Road, Bengaluru, Karnataka
```

TYPE IN Pickup address:

```text
202 Non GST Test Market Road, Bengaluru, Karnataka
```

TYPE IN Return address:

```text
202 Non GST Test Return Desk, Bengaluru, Karnataka
```

UPLOAD:

```text
Government/business document
Exterior shop/business evidence
Interior/inventory evidence
```

CLICK:

```text
Submit seller application
```

EXPECTED:

```text
Application status changes to Submitted, Under review, or a locked-for-review state.
```

# TEST 5 — Admin reviews seller application evidence

LOGIN AS:

```text
ADMIN
```

OPEN:

```text
http://localhost:8098/commerce/admin
```

CLICK:

```text
Refresh applications
```

FIND:

```text
The seller application you submitted.
```

CHECK:

```text
Seller type is visible.
Registered state is visible.
GSTIN/PAN status is visible.
Evidence files are visible.
```

CLICK:

```text
Open
```

EXPECTED:

```text
The uploaded evidence file opens or starts opening in browser/storage.
```

CLICK:

```text
Copy path
```

EXPECTED:

```text
The storage path copies to clipboard.
```

IF THE CARD STATUS IS Submitted:

```text
You should see Under review, Approve, Request info, and Reject.
```

CLICK:

```text
Under review
```

EXPECTED:

```text
Application moves to Under review.
```

CLICK:

```text
Approve
```

EXPECTED:

```text
Application status changes to Approved.
Seller capability becomes active for that user.
```

IF THE CARD IS ALREADY Approved:

```text
Only Suspend may be visible.
Do not click Suspend during the normal approval test unless you are specifically testing suspension.
```

# TEST 6 — Admin requests seller info

LOGIN AS:

```text
ADMIN
```

OPEN:

```text
http://localhost:8098/commerce/admin
```

FIND:

```text
A submitted or under-review seller application that is safe to test.
```

TYPE IN Reason for reject/request info/suspend:

```text
Please upload a clearer business document for manual QA testing.
```

CLICK:

```text
Request info
```

EXPECTED:

```text
Application status changes to More information required.
The applicant should see that the application is not approved yet.
```

# TEST 7 — Admin rejects seller application

LOGIN AS:

```text
ADMIN
```

OPEN:

```text
http://localhost:8098/commerce/admin
```

FIND:

```text
A disposable submitted seller application.
```

TYPE IN Reason for reject/request info/suspend:

```text
Rejected during manual QA testing.
```

CLICK:

```text
Reject
```

EXPECTED:

```text
Application status changes to Rejected.
Seller tools should not unlock for that user.
```

# TEST 8 — Admin suspends and reinstates seller

LOGIN AS:

```text
ADMIN
```

OPEN:

```text
http://localhost:8098/commerce/admin
```

FIND:

```text
An approved disposable seller application.
```

TYPE IN Reason for reject/request info/suspend:

```text
Temporary suspension during manual QA testing.
```

CLICK:

```text
Suspend
```

EXPECTED:

```text
Seller status changes to Suspended.
That seller should no longer be able to use seller tools.
```

CLICK:

```text
Reinstate
```

EXPECTED:

```text
Seller status returns to Approved.
Seller tools should unlock again.
```

# TEST 9 — Open Seller Product Studio

LOGIN AS:

```text
APPROVED SELLER
```

OPEN:

```text
http://localhost:8098/commerce
```

CLICK:

```text
Seller tools
```

EXPECTED:

```text
Seller Product Studio opens.
URL should be /commerce/seller.
```

IF SELLER TOOLS DOES NOT OPEN:

```text
This signed-in account is not currently approved as a seller.
Switch to an approved seller account or approve the seller application from /commerce/admin.
```

# TEST 10 — Create a seller product draft

LOGIN AS:

```text
APPROVED SELLER
```

OPEN:

```text
http://localhost:8098/commerce/seller
```

EXPECTED:

```text
Page title says Seller product studio.
You can see a New product section.
```

TYPE IN Title:

```text
Social24 Test Sneakers
```

TYPE IN Slug:

```text
social24-test-sneakers
```

CLICK CATEGORY:

```text
Everyday
```

TYPE IN Price ₹:

```text
1000
```

TYPE IN Sale price ₹:

```text
900
```

TYPE IN Inventory:

```text
10
```

TYPE IN SKU:

```text
S24-TEST-001
```

TYPE IN Description:

```text
Test product created only for Creator Commerce acceptance testing.
```

TURN ON:

```text
Creator promotion enabled
```

TYPE IN Creator commission %:

```text
20
```

TYPE IN Return window days:

```text
7
```

CLICK:

```text
Save product draft
```

EXPECTED:

```text
Product appears in the seller product list.
Product status should be Draft.
```

IMPORTANT:

```text
Use Open advanced media studio before submitting the draft. Select the same product row, click Add product media, then Update product.
The selected-file count and a visible success/error message must appear. The current live backend still needs migration 20260808092821_fix_creator_commerce_storefront_product_flow.sql before the Storage RLS upload succeeds.
```

# TEST 11 — Submit seller product for admin approval

LOGIN AS:

```text
APPROVED SELLER
```

OPEN:

```text
http://localhost:8098/commerce/seller
```

FIND PRODUCT:

```text
Social24 Test Sneakers
```

CLICK:

```text
Submit for approval
```

EXPECTED:

```text
Product status changes to Submitted or appears in the admin Product approval queue.
```

# TEST 12 — Edit seller product

LOGIN AS:

```text
APPROVED SELLER
```

OPEN:

```text
http://localhost:8098/commerce/seller
```

FIND PRODUCT:

```text
Social24 Test Sneakers
```

CLICK:

```text
Edit
```

CHANGE Sale price ₹:

```text
850
```

CLICK:

```text
Save product draft
```

EXPECTED:

```text
Product saves with the updated sale price.
```

IF YOU DO NOT WANT TO SAVE:

```text
Click Cancel edit.
```

# TEST 13 — Open advanced seller media studio

LOGIN AS:

```text
APPROVED SELLER
```

OPEN:

```text
http://localhost:8098/commerce/seller
```

CLICK:

```text
Open advanced media studio
```

EXPECTED:

```text
URL changes to /seller.
The advanced seller studio starts checking seller approval.
If the seller is approved, the seller studio should open.
```

IF IT STAYS ON "Checking seller approval...":

```text
Wait a few seconds and refresh.
If it still does not open, confirm this account is approved as a seller.
```

# TEST 14 — Admin approves product to live shop

LOGIN AS:

```text
ADMIN
```

OPEN:

```text
http://localhost:8098/commerce/admin
```

SCROLL TO:

```text
Product approval queue
```

CLICK:

```text
Refresh applications
```

FIND PRODUCT:

```text
Social24 Test Sneakers
```

IF PRODUCT QUEUE SAYS "No product submissions yet":

```text
Go back to /commerce/seller as an approved seller and click Submit for approval on a product.
```

CLICK:

```text
Under review
```

EXPECTED:

```text
Product status changes to Under review.
```

OPTIONAL TYPE IN admin notes/reason:

```text
Approved during manual QA testing.
```

CLICK:

```text
Approve live
```

EXPECTED:

```text
Product becomes approved/live.
It should become available to approved creators in Creator workspace.
```

# TEST 15 — Admin requests product changes

LOGIN AS:

```text
ADMIN
```

OPEN:

```text
http://localhost:8098/commerce/admin
```

SCROLL TO:

```text
Product approval queue
```

FIND:

```text
A disposable submitted product.
```

TYPE IN admin notes/reason:

```text
Please improve product details for manual QA testing.
```

CLICK:

```text
Changes required
```

EXPECTED:

```text
Product status changes to Changes required.
Seller should need to edit/resubmit before approval.
```

# TEST 16 — Admin rejects product

LOGIN AS:

```text
ADMIN
```

OPEN:

```text
http://localhost:8098/commerce/admin
```

SCROLL TO:

```text
Product approval queue
```

FIND:

```text
A disposable submitted product.
```

TYPE IN admin notes/reason:

```text
Rejected during manual QA testing.
```

CLICK:

```text
Reject
```

EXPECTED:

```text
Product status changes to Rejected.
Product should not be live in creator marketplace.
```

# TEST 17 — Admin suspends live product

LOGIN AS:

```text
ADMIN
```

OPEN:

```text
http://localhost:8098/commerce/admin
```

SCROLL TO:

```text
Product approval queue
```

FIND:

```text
An approved/live disposable product.
```

TYPE IN admin notes/reason:

```text
Suspended during manual QA testing.
```

CLICK:

```text
Suspend
```

EXPECTED:

```text
Product is removed from live creator commerce availability.
```

# TEST 18 — Submit a creator application

LOGIN AS:

```text
BUYER / NORMAL USER
```

OPEN:

```text
http://localhost:8098/commerce
```

CLICK:

```text
Become a Creator
```

EXPECTED:

```text
Creator onboarding page opens.
URL should be /commerce/creator-onboarding.
```

CLICK:

```text
General Creator
```

TYPE IN Category or niche:

```text
fitness gear
```

TYPE IN About:

```text
Manual test creator for Creator Commerce QA.
```

TYPE IN Instagram handle:

```text
@social24testcreator
```

TYPE IN YouTube handle:

```text
@social24testcreator
```

TYPE IN Identity name:

```text
Social24 Test Creator
```

CLICK:

```text
Government identity evidence
```

SELECT:

```text
Any fake/non-sensitive test image or PDF.
```

CLICK:

```text
Submit creator application
```

EXPECTED:

```text
Application status changes to Submitted or locked for review.
```

# TEST 19 — Submit Professional Verification

LOGIN AS:

```text
BUYER / NORMAL USER or APPROVED CREATOR
```

OPEN:

```text
http://localhost:8098/commerce/creator-onboarding
```

CLICK:

```text
Also apply for Professional Verification
```

OR CLICK:

```text
Apply for Professional Verification
```

EXPECTED:

```text
Professional verification fields become visible.
```

CLICK PROFESSIONAL CATEGORY:

```text
Doctor
```

TYPE IN Professional title:

```text
Doctor
```

TYPE IN Degree:

```text
MBBS
```

TYPE IN Institution:

```text
Social24 Test Medical College
```

TYPE IN Year:

```text
2020
```

TYPE IN Registration/license number:

```text
TEST123456789
```

CLICK:

```text
Credential document
```

SELECT:

```text
Any fake/non-sensitive credential test file.
```

CLICK:

```text
Supporting document
```

SELECT:

```text
Any fake/non-sensitive supporting test file.
```

CLICK:

```text
Submit Professional Verification
```

EXPECTED:

```text
Professional verification status changes to Submitted or locked for review.
```

# TEST 20 — Admin approves creator application

LOGIN AS:

```text
ADMIN
```

OPEN:

```text
http://localhost:8098/commerce/admin
```

CLICK:

```text
Refresh applications
```

FIND:

```text
The creator application you submitted.
```

CLICK:

```text
Open
```

EXPECTED:

```text
Government identity evidence opens or starts opening.
```

CLICK:

```text
Copy path
```

EXPECTED:

```text
Storage path copies to clipboard.
```

CLICK:

```text
Under review
```

EXPECTED:

```text
Creator application status changes to Under review.
```

CLICK:

```text
Approve
```

EXPECTED:

```text
Creator application status changes to Approved.
Creator tools unlock for that user.
```

IF THE CARD IS ALREADY Approved:

```text
Only Suspend may be visible.
Do not click Suspend during the normal approval test unless you are specifically testing suspension.
```

# TEST 21 — Admin approves Professional Verification

LOGIN AS:

```text
ADMIN
```

OPEN:

```text
http://localhost:8098/commerce/admin
```

CLICK:

```text
Refresh applications
```

FIND:

```text
The Professional Verification card you submitted.
```

CHECK:

```text
Profession is visible.
Degree is visible.
License is visible.
Credential document is visible.
Supporting document is visible.
```

CLICK:

```text
Open
```

EXPECTED:

```text
Credential/supporting document opens or starts opening.
```

CLICK:

```text
Approve
```

EXPECTED:

```text
Professional Verification status changes to Approved.
Professional status unlocks for that user.
```

# TEST 22 — Open Creator workspace

LOGIN AS:

```text
APPROVED CREATOR
```

OPEN:

```text
http://localhost:8098/commerce
```

CLICK:

```text
Creator tools
```

EXPECTED:

```text
Creator workspace opens.
URL should be /commerce/creator.
```

IF CREATOR TOOLS DOES NOT OPEN:

```text
This signed-in account is not currently approved as a creator.
Switch to an approved creator account or approve the creator application from /commerce/admin.
```

# TEST 23 — Creator promotes an approved product

LOGIN AS:

```text
APPROVED CREATOR
```

OPEN:

```text
http://localhost:8098/commerce/creator
```

FIND SECTION:

```text
Creator product marketplace
```

FIND PRODUCT:

```text
Social24 Test Sneakers
```

IF NO PRODUCTS ARE VISIBLE:

```text
Go to /commerce/seller, create a product, submit it for approval, then approve it from /commerce/admin.
```

CLICK:

```text
Promote
```

EXPECTED:

```text
A creator promotion record is created or refreshed.
The product should show promotion/tracking information for the creator.
```

IF BUTTON SAYS Refresh promotion:

```text
Click Refresh promotion.
```

EXPECTED:

```text
Existing promotion information refreshes.
```

# TEST 24 — Creator adds product to cart

LOGIN AS:

```text
APPROVED CREATOR
```

OPEN:

```text
http://localhost:8098/commerce/creator
```

FIND PRODUCT:

```text
Social24 Test Sneakers
```

CLICK:

```text
Add to cart
```

EXPECTED:

```text
The product appears in the Cart and checkout section.
```

# TEST 25 — External checkout from Creator workspace

LOGIN AS:

```text
APPROVED CREATOR
```

OPEN:

```text
http://localhost:8098/commerce/creator
```

FIND SECTION:

```text
Cart and checkout
```

TYPE IN Recipient name:

```text
Vamshi Test Buyer
```

TYPE IN Phone:

```text
9000000000
```

TYPE IN Address:

```text
101 Test Street
```

TYPE IN City:

```text
Bengaluru
```

TYPE IN State code:

```text
KARNATAKA
```

TYPE IN Postal code:

```text
560102
```

CLICK:

```text
Checkout external
```

EXPECTED:

```text
Checkout is created.
An alert or confirmation appears.
Checkout appears in the Checkouts section.
Payment mode/status should reflect external checkout flow.
```

# TEST 26 — COD checkout from Creator workspace

LOGIN AS:

```text
APPROVED CREATOR using a buyer profile with verified Buyer KYC
```

OPEN:

```text
http://localhost:8098/commerce/creator
```

ADD PRODUCT TO CART:

```text
Social24 Test Sneakers
```

TYPE IN Recipient name:

```text
Vamshi Test Buyer
```

TYPE IN Phone:

```text
9000000000
```

TYPE IN Address:

```text
101 Test Street
```

TYPE IN City:

```text
Bengaluru
```

TYPE IN State code:

```text
KARNATAKA
```

TYPE IN Postal code:

```text
560102
```

CLICK:

```text
Checkout COD
```

EXPECTED IF BUYER KYC IS VERIFIED:

```text
COD checkout is created.
Checkout appears in the Checkouts section.
```

EXPECTED IF BUYER KYC IS NOT VERIFIED:

```text
COD checkout is blocked.
The app should show an error or alert saying the buyer is not eligible for COD.
```

IMPORTANT:

```text
There is no visible Buyer KYC self-verification button in the current UI.
If you need to test successful COD, prepare a dedicated test buyer with verified KYC in the backend first.
```

# TEST 27 — Non-GST seller state restriction

PREREQUISITE:

```text
You need an approved Non-GST seller.
The currently visible approved seller in admin is GST Registered, so this test needs a separate Non-GST approved seller.
```

LOGIN AS:

```text
APPROVED CREATOR or buyer account used for checkout
```

OPEN:

```text
http://localhost:8098/commerce/creator
```

ADD PRODUCT FROM NON-GST SELLER TO CART.

TYPE IN State code:

```text
KARNATAKA
```

CLICK:

```text
Checkout external
```

EXPECTED:

```text
Checkout should be allowed when buyer state matches the Non-GST seller state.
```

REPEAT WITH State code:

```text
TELANGANA
```

CLICK:

```text
Checkout external
```

EXPECTED:

```text
Checkout should be blocked for a Non-GST seller shipping outside the seller's registered state.
```

# TEST 28 — Seller fulfils order

LOGIN AS:

```text
APPROVED SELLER
```

OPEN:

```text
http://localhost:8098/commerce/seller
```

FIND SECTION:

```text
Seller fulfillment
```

FIND ORDER:

```text
Order created from checkout.
```

IF NO ORDERS ARE VISIBLE:

```text
Create a checkout first from /commerce/creator.
```

CLICK:

```text
confirmed
```

EXPECTED:

```text
Order status changes to confirmed.
```

CLICK:

```text
processing
```

EXPECTED:

```text
Order status changes to processing.
```

CLICK:

```text
shipped
```

EXPECTED:

```text
Order status changes to shipped.
```

CLICK:

```text
out for delivery
```

EXPECTED:

```text
Order status changes to out for delivery.
```

CLICK:

```text
delivered
```

EXPECTED:

```text
Order status changes to delivered.
Delivered orders become eligible for return testing.
```

IMPORTANT:

```text
Packing evidence is click-testable. Select an image under the order, upload it, confirm View/Replace appears, and refresh to verify persistence.
```

# TEST 29 — Buyer/creator submits return request

LOGIN AS:

```text
The account that created the checkout/order
```

OPEN:

```text
http://localhost:8098/commerce/creator
```

FIND SECTION:

```text
Buyer orders and returns
```

FIND:

```text
A delivered order item.
```

TYPE IN Return reason:

```text
Manual QA return request for delivered test order.
```

CLICK:

```text
Submit return request
```

EXPECTED:

```text
Return request is created.
The UI shows a return submitted confirmation or updated return status.
```

IF RETURN BUTTON IS NOT VISIBLE OR NOT ENABLED:

```text
Finish seller fulfillment first and mark the order as delivered.
```

IMPORTANT:

```text
Unboxing evidence is click-testable on the buyer order item. Upload an image, confirm View/Replace appears, and refresh to verify persistence before submitting the return.
```

# TEST 30 — Creator commissions

LOGIN AS:

```text
APPROVED CREATOR
```

OPEN:

```text
http://localhost:8098/commerce/creator
```

FIND SECTION:

```text
Creator commissions
```

EXPECTED BEFORE SALES:

```text
No commission rows may appear.
```

EXPECTED AFTER ATTRIBUTED CHECKOUT / ORDER:

```text
Commission rows should appear for creator-attributed commerce activity.
```

CHECK:

```text
Commission amount/status is visible.
```

IMPORTANT:

```text
There is no visible commission payout button in the current UI.
There is no standalone creator earnings route.
Creator earnings/commissions are inside /commerce/creator.
```

# TEST 31 — Existing Shop tab

OPEN:

```text
http://localhost:8098/shop
```

EXPECTED:

```text
Shop screen loads.
You may briefly see "Loading the marketplace..."
Bottom tabs are visible: Chats, Social, Discover, Shop, Wallet.
```

IF PRODUCTS LOAD:

```text
Click a category filter if visible.
Click a product card if visible.
Click Add to bag if visible.
Click the cart icon if visible.
Click + or - to change quantity if visible.
Click Continue to checkout if visible.
```

EXPECTED CURRENT BEHAVIOR:

```text
The existing Shop cart is not the new Creator Commerce checkout.
If Continue to checkout shows "Checkout not wired", that is the current UI behavior.
Use /commerce/creator for the internal Creator Commerce checkout flow.
```

# TEST 32 — Storefront product pages

OPEN:

```text
http://localhost:8098/store/[slug]
```

REPLACE `[slug]` WITH:

```text
An actual seller/store slug from the app data.
```

EXPECTED:

```text
Storefront opens only if that slug exists.
```

OPEN:

```text
http://localhost:8098/store/[slug]/product/[productSlug]
```

REPLACE `[productSlug]` WITH:

```text
An actual product slug from the app data.
```

EXPECTED:

```text
Product detail page opens only if both the store slug and product slug exist.
```

IMPORTANT:

```text
Do not guess slugs.
Use product/store slugs visible in the app or Supabase data.
```

# TEST 33 — Locked seller route

LOGIN AS:

```text
BUYER / NORMAL USER
```

OPEN:

```text
http://localhost:8098/commerce/seller
```

EXPECTED:

```text
Normal user should not be able to use Seller Product Studio.
The app should show a locked/access-denied/redirect state.
```

# TEST 34 — Locked creator route

LOGIN AS:

```text
BUYER / NORMAL USER
```

OPEN:

```text
http://localhost:8098/commerce/creator
```

EXPECTED:

```text
Normal user should not be able to use Creator workspace.
The app should show a locked/access-denied/redirect state.
```

# TEST 35 — Admin evidence preview behavior

LOGIN AS:

```text
ADMIN
```

OPEN:

```text
http://localhost:8098/commerce/admin
```

FIND:

```text
Any application card with uploaded evidence.
```

IF YOU SEE A THUMBNAIL:

```text
Click View.
```

EXPECTED:

```text
Evidence preview opens.
```

CLICK:

```text
Open
```

EXPECTED:

```text
The evidence file opens through storage/browser.
```

CLICK:

```text
Copy path
```

EXPECTED:

```text
Storage path copies to clipboard.
```

# CURRENT ROUTES THAT EXIST

These routes exist in the current app:

```text
/commerce
/commerce/admin
/commerce/seller
/commerce/creator
/commerce/seller-onboarding
/commerce/creator-onboarding
/shop
/seller
/store/[slug]
/store/[slug]/product/[productSlug]
```

# CURRENT ROUTES OR BUTTONS THAT DO NOT EXIST

Do not look for these as standalone pages/buttons right now:

```text
No standalone /checkout route was found.
No standalone returns route was found.
No standalone creator earnings route was found.
No visible Buyer KYC self-verification button was found.
No visible packing evidence upload button was found in /commerce/seller.
No visible unboxing evidence upload button was found in /commerce/creator returns.
No visible commission payout button was found.
No visible product media upload button was found inside /commerce/seller.
No visible admin button for manually confirming external payment was found.
```

Use these current locations instead:

```text
Checkout:
/commerce/creator → Cart and checkout

Returns:
/commerce/creator → Buyer orders and returns

Creator commissions:
/commerce/creator → Creator commissions

Seller fulfillment:
/commerce/seller → Seller fulfillment

Product media:
/commerce/seller → Open advanced media studio → /seller
```

# FINAL ACCEPTANCE CHECKLIST

CHECK:

```text
Normal user can submit seller application.
```

CHECK:

```text
Admin can review seller evidence.
```

CHECK:

```text
Admin can approve seller.
```

CHECK:

```text
Approved seller can open /commerce/seller.
```

CHECK:

```text
Approved seller can create product draft.
```

CHECK:

```text
Approved seller can submit product for approval.
```

CHECK:

```text
Admin can approve product live.
```

CHECK:

```text
Normal user can submit creator application.
```

CHECK:

```text
Admin can approve creator.
```

CHECK:

```text
Approved creator can open /commerce/creator.
```

CHECK:

```text
Approved creator can promote approved product.
```

CHECK:

```text
Approved creator can add product to cart.
```

CHECK:

```text
Approved creator can create external checkout.
```

CHECK:

```text
COD is blocked when Buyer KYC is not verified.
```

CHECK:

```text
COD works only after Buyer KYC is verified through backend/test setup.
```

CHECK:

```text
Seller can move order through fulfillment statuses.
```

CHECK:

```text
Delivered order can receive a return request.
```

CHECK:

```text
Creator commissions appear after attributed commerce activity.
```

CHECK:

```text
Normal users cannot open admin, seller, or creator protected tools without the required status.
```
