-- Replacing existing functions preserves explicit role grants. Remove every
-- anonymous grant from the redesigned Creator Commerce RPC surface.
revoke all on function public.get_my_commerce_verification_profile() from public, anon;
revoke all on function public.save_creator_commerce_onboarding_draft(text, jsonb) from public, anon;
revoke all on function public.save_creator_commerce_product(uuid,text,text,text,integer,integer,integer,text,text,text,boolean,integer,integer) from public, anon;
revoke all on function public.publish_creator_commerce_product(uuid) from public, anon;
revoke all on function public.submit_creator_commerce_product(uuid) from public, anon;
revoke all on function public.replace_creator_commerce_product_media(uuid,jsonb) from public, anon;

grant execute on function public.get_my_commerce_verification_profile() to authenticated;
grant execute on function public.save_creator_commerce_onboarding_draft(text, jsonb) to authenticated;
grant execute on function public.save_creator_commerce_product(uuid,text,text,text,integer,integer,integer,text,text,text,boolean,integer,integer) to authenticated;
grant execute on function public.publish_creator_commerce_product(uuid) to authenticated;
grant execute on function public.submit_creator_commerce_product(uuid) to authenticated;
grant execute on function public.replace_creator_commerce_product_media(uuid,jsonb) to authenticated;

revoke all on function private.can_manage_product_media_path(text) from public, anon;
revoke all on function private.protect_creator_commerce_product_state() from public, anon;
