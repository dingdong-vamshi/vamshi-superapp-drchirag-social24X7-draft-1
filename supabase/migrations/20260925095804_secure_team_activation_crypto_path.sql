-- These security-definer functions use pgcrypto primitives. Keep a fixed,
-- trusted path that resolves only built-in and extension functions.
alter function public.create_storefront_team_invitation(
  uuid, text, text, text, text, text, text, text, uuid, text[]
) set search_path = pg_catalog, extensions;

alter function public.resend_storefront_team_activation(uuid)
  set search_path = pg_catalog, extensions;

alter function public.claim_business_team_activation(text, text)
  set search_path = pg_catalog, extensions;

alter function public.complete_business_team_activation(uuid, uuid, text)
  set search_path = pg_catalog, extensions;
