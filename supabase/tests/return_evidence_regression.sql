-- Transactional live-schema regression. This uses the existing Arjun Buyer ->
-- Naveen Seller delivered QA order and rolls every mutation back.

begin;

do $return_regression$
declare
  v_buyer constant uuid := '12710299-fe10-42a0-9122-36f3f2bdbe53';
  v_seller constant uuid := '272d8b05-da97-4d4c-8294-be45b7958ec9';
  v_other constant uuid := '4491d985-8769-4038-80e0-a48c3bac14bf';
  v_order constant uuid := '16e3cc08-6cbc-4e19-9a55-7bf4c18f645d';
  v_item constant uuid := 'fdb781d4-a71c-41e5-a808-2a79b09893f1';
  v_return public.return_requests;
  v_intent record;
begin
  perform set_config('request.jwt.claim.sub', v_buyer::text, true);
  select * into v_return
  from public.submit_creator_commerce_return(v_item, 'Transactional QA return', 'Details persist');

  assert v_return.buyer_id = v_buyer, 'return buyer mismatch';
  assert v_return.order_id = v_order, 'return order mismatch';
  assert v_return.seller_id = v_seller, 'return seller mismatch';
  assert v_return.storefront_id = 'ab78991c-29a0-4286-aa82-201e88ae1b15', 'return storefront mismatch';
  assert v_return.details = 'Details persist', 'return details did not persist';
  assert exists (
    select 1 from public.commerce_order_chat_events event
    where event.order_id = v_order and event.event_type = 'return_requested'
  ), 'return request Business Chat event missing';

  begin
    perform public.submit_creator_commerce_return(v_item, 'Duplicate', null);
    raise exception 'duplicate return unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%return already exists%' then raise; end if;
  end;

  select * into v_intent
  from public.begin_trusted_commerce_evidence_capture(v_order, v_item, 'return', v_return.id);
  assert exists (
    select 1 from public.commerce_evidence_capture_intents intent
    where intent.id = v_intent.intent_id
      and intent.return_request_id = v_return.id
      and intent.evidence_source = 'live_capture'
  ), 'trusted return evidence intent was not server-authored';

  perform set_config('request.jwt.claim.sub', v_other::text, true);
  begin
    perform public.begin_trusted_commerce_evidence_capture(v_order, v_item, 'return', v_return.id);
    raise exception 'another user unexpectedly opened return evidence';
  exception when others then
    if sqlerrm not like '%Open buyer return not found%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', v_buyer::text, true);
  begin
    perform public.seller_review_creator_commerce_return(v_return.id, 'approved', null);
    raise exception 'buyer unexpectedly approved their return';
  exception when others then
    if sqlerrm not like '%Seller access required%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', v_seller::text, true);
  select * into v_return
  from public.seller_review_creator_commerce_return(
    v_return.id,
    'under_review',
    'Please provide more information in this Business Chat.'
  );
  assert v_return.status = 'under_review', 'more-info closed the return';
  assert v_return.reviewed_at is null, 'more-info marked the return reviewed';

  select * into v_return
  from public.seller_review_creator_commerce_return(v_return.id, 'approved', 'QA approve');
  assert v_return.status = 'approved', 'seller approval failed';
  assert (select status from public.orders where id = v_order) = 'return_approved', 'order approval state mismatch';
  assert (select commission_status from public.order_items where id = v_item) = 'reversed', 'commission was not reversed';
  assert exists (
    select 1 from public.refund_requests refund
    where refund.return_request_id = v_return.id
      and refund.status = 'external_integration_pending'
  ), 'provider-neutral refund request missing';
  assert exists (
    select 1 from public.commerce_order_chat_events event
    where event.order_id = v_order and event.event_type = 'return_approved'
  ), 'return approval Business Chat event missing';
end;
$return_regression$;

rollback;

begin;

insert into public.return_requests (
  id, order_item_id, order_id, buyer_id, seller_id, storefront_id, reason
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'fdb781d4-a71c-41e5-a808-2a79b09893f1',
  '16e3cc08-6cbc-4e19-9a55-7bf4c18f645d',
  '12710299-fe10-42a0-9122-36f3f2bdbe53',
  '272d8b05-da97-4d4c-8294-be45b7958ec9',
  'ab78991c-29a0-4286-aa82-201e88ae1b15',
  'Transactional RLS QA'
);

insert into public.commerce_order_evidence (
  id, owner_id, order_id, order_item_id, return_request_id, evidence_kind,
  evidence_source, captured_at, storage_path, file_name, mime_type, file_size
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '12710299-fe10-42a0-9122-36f3f2bdbe53',
  '16e3cc08-6cbc-4e19-9a55-7bf4c18f645d',
  'fdb781d4-a71c-41e5-a808-2a79b09893f1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'return', 'live_capture', now(),
  'transactional/rls/evidence.jpg', 'rls.jpg', 'image/jpeg', 1024
);

select set_config('request.jwt.claim.sub', '12710299-fe10-42a0-9122-36f3f2bdbe53', true);
set local role authenticated;
do $buyer_rls$
begin
  assert (select count(*) from public.commerce_order_evidence where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 1,
    'buyer cannot read their return evidence';
end;
$buyer_rls$;
reset role;

select set_config('request.jwt.claim.sub', '272d8b05-da97-4d4c-8294-be45b7958ec9', true);
set local role authenticated;
do $seller_rls$
begin
  assert (select count(*) from public.commerce_order_evidence where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 1,
    'seller cannot read their return evidence';
end;
$seller_rls$;
reset role;

select set_config('request.jwt.claim.sub', '4491d985-8769-4038-80e0-a48c3bac14bf', true);
set local role authenticated;
do $other_rls$
begin
  assert (select count(*) from public.commerce_order_evidence where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 0,
    'another user can read private return evidence';
end;
$other_rls$;
reset role;

rollback;

begin;

do $reject_regression$
declare
  v_buyer constant uuid := '12710299-fe10-42a0-9122-36f3f2bdbe53';
  v_seller constant uuid := '272d8b05-da97-4d4c-8294-be45b7958ec9';
  v_item constant uuid := 'fdb781d4-a71c-41e5-a808-2a79b09893f1';
  v_order constant uuid := '16e3cc08-6cbc-4e19-9a55-7bf4c18f645d';
  v_return public.return_requests;
begin
  perform set_config('request.jwt.claim.sub', v_buyer::text, true);
  select * into v_return
  from public.submit_creator_commerce_return(v_item, 'Transactional reject QA', null);
  perform set_config('request.jwt.claim.sub', v_seller::text, true);
  select * into v_return
  from public.seller_review_creator_commerce_return(v_return.id, 'rejected', 'QA reject');
  assert v_return.status = 'rejected', 'seller rejection failed';
  assert (select status from public.orders where id = v_order) = 'return_rejected', 'order rejection state mismatch';
  assert (select commission_status from public.order_items where id = v_item) = 'none', 'commission state was not restored';
  assert exists (
    select 1 from public.commerce_order_chat_events event
    where event.order_id = v_order and event.event_type = 'return_rejected'
  ), 'return rejection Business Chat event missing';
end;
$reject_regression$;

rollback;
