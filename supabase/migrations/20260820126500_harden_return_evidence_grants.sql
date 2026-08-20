-- RLS already denies anonymous access, and these explicit revocations avoid
-- leaving broad table grants in place for private transaction data.
revoke all on table public.return_requests from public, anon;
revoke all on table public.commerce_order_evidence from public, anon;
grant select on table public.return_requests to authenticated;
grant select on table public.commerce_order_evidence to authenticated;
