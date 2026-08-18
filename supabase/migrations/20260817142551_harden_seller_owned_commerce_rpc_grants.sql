-- Supabase may preserve role-specific default EXECUTE grants when a function is
-- replaced. Remove anonymous access explicitly from all authenticated mutation
-- RPCs introduced by the Seller-owned Commerce finalization.

revoke execute on function public.begin_commerce_evidence_capture(uuid, uuid, text, text) from anon;
revoke execute on function public.finalize_commerce_evidence_capture(uuid, text, text, text, integer) from anon;
revoke execute on function public.seller_review_creator_commerce_return(uuid, text, text) from anon;

grant execute on function public.begin_commerce_evidence_capture(uuid, uuid, text, text) to authenticated;
grant execute on function public.finalize_commerce_evidence_capture(uuid, text, text, text, integer) to authenticated;
grant execute on function public.seller_review_creator_commerce_return(uuid, text, text) to authenticated;
