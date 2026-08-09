# Creator Commerce First Batch Test Guide

Use a real Supabase email account. Demo users cannot submit or approve commerce applications.

## 1. Signed-Out Commerce Protection

LOGIN AS: Signed out

GO TO: `/commerce`

CLICK: Nothing

ENTER: Nothing

EXPECTED RESULT: Login screen appears.

WHY THIS TEST MATTERS: Commerce routes must require Auth.

IF IT FAILS WHAT IT PROBABLY MEANS: Expo protected routes or auth session restoration is misconfigured.

## 2. Commerce Hub

LOGIN AS: Normal user

GO TO: `/commerce`

CLICK: Refresh commerce status

ENTER: Nothing

EXPECTED RESULT: Seller, Creator, Professional, and Buyer KYC statuses load.

WHY THIS TEST MATTERS: The app must read server-owned access state from Supabase.

IF IT FAILS WHAT IT PROBABLY MEANS: Supabase env, Auth session, RPC grant, or RLS is wrong.

## 3. GST Seller Application

LOGIN AS: Seller applicant

GO TO: `/commerce`

CLICK: Become a Seller, GST Registered Seller, upload each evidence item, Submit seller application

ENTER: Legal name, store name, business name, registered state, city, phone, email, GSTIN, store address, pickup address, return address

EXPECTED RESULT: Application status becomes Submitted or Under review. Seller tools stay locked.

WHY THIS TEST MATTERS: Seller submission must not self-approve.

IF IT FAILS WHAT IT PROBABLY MEANS: Seller RLS insert/update policy, private storage upload, or form validation failed.

## 4. Non-GST Seller State

LOGIN AS: Non-GST seller applicant

GO TO: `/commerce/seller-onboarding`

CLICK: Non-GST Seller, Submit seller application

ENTER: Registered state and PAN/local seller ID

EXPECTED RESULT: Registered state persists on the seller application.

WHY THIS TEST MATTERS: Non-GST sellers are home-state only in later checkout enforcement.

IF IT FAILS WHAT IT PROBABLY MEANS: Seller type/state mapping is wrong.

## 5. General Creator Application

LOGIN AS: Creator applicant

GO TO: `/commerce`

CLICK: Become a Creator, General Creator, upload identity evidence, Submit creator application

ENTER: Category, about, social handles, identity name

EXPECTED RESULT: Creator application is Submitted. Creator tools stay locked.

WHY THIS TEST MATTERS: Creator approval must be admin-controlled.

IF IT FAILS WHAT IT PROBABLY MEANS: Creator table policy or submit payload is wrong.

## 6. Professional Creator Application

LOGIN AS: Professional applicant

GO TO: `/commerce/creator-onboarding`

CLICK: Verified Professional, upload credential evidence, Submit creator application

ENTER: Professional category, title, degree, institution, year, registration/license number

EXPECTED RESULT: Professional verification is Submitted. No verified badge is granted.

WHY THIS TEST MATTERS: High-stakes professional verification must not self-approve.

IF IT FAILS WHAT IT PROBABLY MEANS: Professional verification policy, upload, or access-state separation failed.

## 7. Admin Review

LOGIN AS: Commerce admin

GO TO: `/commerce/admin`

CLICK: Refresh applications, Approve, Reject, Request info, or Suspend

ENTER: A reason before Reject, Request info, or Suspend

EXPECTED RESULT: Admin action updates Supabase. Approve unlocks the matching seller/creator/professional route after refresh.

WHY THIS TEST MATTERS: Approval must be a real backend mutation, not frontend state.

IF IT FAILS WHAT IT PROBABLY MEANS: Admin app_metadata role, admin_access route flag, review RPC, or RLS policy is missing.

## 8. Normal User Admin Denial

LOGIN AS: Normal user

GO TO: `/commerce/admin`

CLICK: Nothing

ENTER: Nothing

EXPECTED RESULT: Admin route is not available.

WHY THIS TEST MATTERS: Frontend hiding and backend RLS must agree.

IF IT FAILS WHAT IT PROBABLY MEANS: Admin route guard or access RPC is wrong.

## 9. Sign Out Protection

LOGIN AS: Any real user

GO TO: `/profile`

CLICK: Sign out

ENTER: Nothing

EXPECTED RESULT: Opening `/commerce` returns to login.

WHY THIS TEST MATTERS: Protected commerce routes must clear after sign-out.

IF IT FAILS WHAT IT PROBABLY MEANS: Supabase session persistence or root protected routes are wrong.
