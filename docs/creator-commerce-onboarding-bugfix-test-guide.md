# Creator Commerce onboarding bugfix test guide

## Bug: Seller submission looked stuck and returned blank

### What was wrong

Seller evidence uploads succeeded, but seller application submission failed at the database row insert/update.

### Root cause

The app wrote `verification_mode = 'admin_review'`, but the existing `seller_applications_verification_mode_check` constraint only allows `manual` or `self_attested`.

The screen also depended too much on transient form state after submit and used web alerts without an inline fallback.

### What was fixed

- Seller submission now writes `verification_mode = 'manual'`.
- After submit, the screen reloads the saved seller application from Supabase.
- Submitted seller details and evidence stay visible.
- Submitted/under-review/approved/suspended applications render read-only.
- Submit errors are shown inline on the page.
- “My application” queries explicitly filter by the signed-in `owner_id`.

### How I test it

1. Log in as a real Supabase seller applicant.
2. Open `/commerce/seller-onboarding`.
3. Fill required fields.
4. Upload business, exterior, and interior evidence.
5. Click `Submit seller application`.
6. Leave the route.
7. Reopen `/commerce/seller-onboarding`.

### Expected result

The page shows `Application status: Submitted`, keeps the submitted values visible, keeps evidence attached, and shows `Application locked for review`.

## Bug: Admin approve redirected to the Commerce hub

### What was wrong

After admin review actions, the app refreshed global commerce access. That refresh set `loading = true`.

### Root cause

The commerce layout returned only a spinner while access was loading, temporarily unmounting the Expo Router stack. When `/commerce/admin` was unmounted during a post-review refresh, Expo Router fell back to the commerce hub.

### What was fixed

- Commerce access now distinguishes initial loading from background refreshing.
- The commerce navigator remains mounted during background refresh.
- Admin review actions update/refetch the application list without refreshing the admin’s route guard state.
- Review buttons show per-action processing state.

### How I test it

1. Log in as commerce admin.
2. Open `/commerce/admin`.
3. Click `Under review` or `Approve` on a real application.

### Expected result

The URL remains `/commerce/admin`, the card updates immediately, and the admin authorization stays intact.

## Bug: Admin could not inspect evidence

### What was wrong

Admin Review showed raw private storage paths and a copy button, but no preview.

### Root cause

The UI did not request short-lived signed URLs for private evidence files.

### What was fixed

- Private bucket stays private.
- Admin evidence rows show human labels, file name, MIME type, size, submitted time, and technical storage path.
- Image evidence gets a thumbnail.
- `View` opens an in-app preview modal with a short-lived signed URL.
- `Open` opens the secure temporary URL.
- Signed URLs are generated on demand and expire after 300 seconds.

### How I test it

1. Log in as commerce admin.
2. Open `/commerce/admin`.
3. Click `View` on creator or seller evidence.

### Expected result

The preview opens while staying on `/commerce/admin`; private raw bucket URLs are not made public.

## Bug: Dummy data polluted Admin Review

### What was wrong

Admin Review contained previous Codex validation rows such as `Codex Test Store`, `Health education`, and `Physician`.

### Root cause

Earlier manual validation created rows in the live backend. They were not migration seeds, but stale test data.

### What was fixed

Confirmed Codex/demo application rows were removed from live application tables. The real `naveen.qa24@gmail.com` creator application and related uploaded evidence metadata were preserved.

### How I test it

1. Open `/commerce/admin` as commerce admin.
2. Review the application list.

### Expected result

Only legitimate remaining application data is shown.

## Security checks

### Normal user must not access admin

Open `/commerce/admin` as a non-admin user.

Expected: the route redirects to `/commerce`, and Admin Review is disabled.

### Normal user must not view other users' private evidence

Attempt to create a signed URL for another user's private evidence path.

Expected: Supabase Storage rejects it.

### Normal user must not approve themselves

Call `review_creator_commerce_application` as a non-admin.

Expected: `Commerce admin access required`.
