-- Mirror all client-required Stage 1 fields in the authoritative submission and
-- approval readiness checks. Existing approved applications remain untouched.

create or replace function private.seller_application_ready(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select nullif(trim(application.legal_name), '') is not null
      and nullif(trim(application.storefront_name), '') is not null
      and nullif(trim(application.business_name), '') is not null
      and nullif(trim(application.registered_state), '') is not null
      and nullif(trim(application.city), '') is not null
      and nullif(trim(application.phone), '') is not null
      and nullif(trim(application.email), '') is not null
      and nullif(trim(application.address_line), '') is not null
      and nullif(trim(application.pickup_address), '') is not null
      and nullif(trim(application.return_address), '') is not null
      and nullif(trim(application.application_payload->>'postalCode'), '') is not null
      and application.location_latitude is not null
      and application.location_longitude is not null
      and case
        when application.seller_type = 'gst' then nullif(trim(application.gstin), '') is not null
        else nullif(trim(application.pan_number), '') is not null
          and nullif(trim(application.application_payload->>'localSellerId'), '') is not null
          and coalesce((application.application_payload->>'declarationAccepted')::boolean, false)
      end
      and nullif(trim(application.application_payload->>'bankAccountHolder'), '') is not null
      and nullif(trim(application.application_payload->>'bankAccountNumber'), '') is not null
      and nullif(trim(application.application_payload->>'bankIfsc'), '') is not null
      and private.has_creator_commerce_evidence(application.owner_id, 'seller', application.document_path, false)
      and private.has_creator_commerce_evidence(application.owner_id, 'seller', application.exterior_evidence_path, false)
      and private.has_creator_commerce_evidence(application.owner_id, 'seller', application.interior_evidence_path, false)
      and private.has_creator_commerce_evidence(application.owner_id, 'seller', application.business_verification_video_path, true)
    from public.seller_applications application where application.id = p_application_id
  ), false);
$$;

create or replace function private.creator_application_ready(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.creator_selection_is_valid(application.macro_category, application.specializations)
      and nullif(trim(application.about), '') is not null
      and nullif(trim(application.identity_name), '') is not null
      and nullif(trim(application.application_payload->>'panNumber'), '') is not null
      and exists (
        select 1
        from jsonb_each_text(coalesce(application.social_handles, '{}'::jsonb)) handle
        where nullif(trim(handle.value), '') is not null
      )
      and (
        nullif(trim(application.application_payload->>'payoutUpi'), '') is not null
        or (
          nullif(trim(application.application_payload->>'bankAccountHolder'), '') is not null
          and nullif(trim(application.application_payload->>'bankAccountNumber'), '') is not null
          and nullif(trim(application.application_payload->>'bankIfsc'), '') is not null
        )
      )
      and private.has_creator_commerce_evidence(application.owner_id, 'creator', application.identity_document_path, false)
      and (
        not exists (
          select 1 from public.creator_specialization_policies policy
          where policy.specialization = any(application.specializations) and policy.requires_professional_verification
        )
        or exists (
          select 1 from public.professional_verification_requests request
          where request.creator_application_id = application.id
            and request.owner_id = application.owner_id
            and request.status in ('submitted','under_review','approved')
            and private.professional_request_ready(request.id)
        )
      )
    from public.creator_applications application where application.id = p_application_id
  ), false);
$$;

revoke all on function private.seller_application_ready(uuid) from public;
revoke all on function private.creator_application_ready(uuid) from public;
