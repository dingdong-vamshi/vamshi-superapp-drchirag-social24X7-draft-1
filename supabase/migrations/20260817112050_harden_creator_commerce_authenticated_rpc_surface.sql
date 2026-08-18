-- Creator Commerce actions below always operate on the current signed-in user
-- or an Admin capability. Keep them unavailable to the anonymous API role.
do $block$
declare
  function_record record;
begin
  for function_record in
    select
      namespace.nspname as schema_name,
      procedure.proname as function_name,
      pg_get_function_identity_arguments(procedure.oid) as identity_arguments
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = any (array[
        'admin_confirm_checkout_payment_for_test',
        'admin_release_creator_commissions_for_test',
        'admin_review_creator_commerce_return',
        'admin_set_buyer_kyc_status_for_test',
        'create_creator_commerce_checkout',
        'create_creator_product_promotion',
        'ensure_creator_commerce_storefront',
        'get_my_commerce_verification_profile',
        'get_my_creator_commerce_access',
        'publish_creator_commerce_product',
        'replace_creator_commerce_product_media',
        'review_creator_commerce_application',
        'review_creator_commerce_product',
        'save_creator_commerce_onboarding_draft',
        'save_creator_commerce_product',
        'seller_update_creator_commerce_fulfillment',
        'submit_creator_commerce_product',
        'submit_creator_commerce_return',
        'upsert_creator_commerce_cart_item'
      ])
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments
    );
    execute format(
      'grant execute on function %I.%I(%s) to authenticated',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments
    );
  end loop;
end
$block$;
