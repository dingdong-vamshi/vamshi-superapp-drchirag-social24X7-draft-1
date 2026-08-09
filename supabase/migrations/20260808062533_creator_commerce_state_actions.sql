create or replace function private.sync_creator_commerce_access_from_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'draft' then
    return new;
  end if;

  if tg_table_name = 'seller_applications' then
    update public.creator_commerce_access
    set seller_status = new.status,
        updated_at = now()
    where user_id = new.owner_id;
  elsif tg_table_name = 'creator_applications' then
    update public.creator_commerce_access
    set creator_status = new.status,
        updated_at = now()
    where user_id = new.owner_id;
  elsif tg_table_name = 'professional_verification_requests' then
    update public.creator_commerce_access
    set professional_status = new.status,
        updated_at = now()
    where user_id = new.owner_id;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_creator_commerce_access_from_application() from public;

drop trigger if exists sync_seller_application_access_status on public.seller_applications;
create trigger sync_seller_application_access_status
after insert or update of status on public.seller_applications
for each row execute function private.sync_creator_commerce_access_from_application();

drop trigger if exists sync_creator_application_access_status on public.creator_applications;
create trigger sync_creator_application_access_status
after insert or update of status on public.creator_applications
for each row execute function private.sync_creator_commerce_access_from_application();

drop trigger if exists sync_professional_verification_access_status on public.professional_verification_requests;
create trigger sync_professional_verification_access_status
after insert or update of status on public.professional_verification_requests
for each row execute function private.sync_creator_commerce_access_from_application();

create or replace function public.review_creator_commerce_application(
  target_kind text,
  target_id uuid,
  target_decision text,
  target_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  applicant_id uuid;
  decision public.commerce_approval_status;
  current_status public.commerce_approval_status;
  reason text := nullif(trim(coalesce(target_reason, '')), '');
begin
  if not (select private.is_creator_commerce_admin()) then
    raise exception 'Commerce admin access required' using errcode = '42501';
  end if;

  if target_decision not in (
    'approved',
    'rejected',
    'more_information_required',
    'suspended',
    'under_review'
  ) then
    raise exception 'Unsupported review decision: %', target_decision using errcode = '22023';
  end if;

  if target_decision in ('rejected', 'more_information_required', 'suspended') and reason is null then
    raise exception 'A reason is required for this review decision' using errcode = '22023';
  end if;

  decision := target_decision::public.commerce_approval_status;

  if target_kind = 'seller' then
    select owner_id, status
    into applicant_id, current_status
    from public.seller_applications
    where id = target_id;
  elsif target_kind = 'creator' then
    select owner_id, status
    into applicant_id, current_status
    from public.creator_applications
    where id = target_id;
  elsif target_kind = 'professional' then
    select owner_id, status
    into applicant_id, current_status
    from public.professional_verification_requests
    where id = target_id;
  else
    raise exception 'Unsupported application kind: %', target_kind using errcode = '22023';
  end if;

  if applicant_id is null then
    raise exception 'Commerce application not found' using errcode = 'P0002';
  end if;

  if current_status = decision then
    raise exception 'Invalid state transition for %: % -> %', target_kind, current_status, decision using errcode = '22023';
  end if;

  if not (
    (current_status = 'submitted' and decision in ('under_review', 'approved', 'more_information_required', 'rejected'))
    or (current_status = 'under_review' and decision in ('approved', 'more_information_required', 'rejected'))
    or (current_status = 'more_information_required' and decision in ('under_review', 'approved', 'rejected'))
    or (current_status = 'approved' and decision = 'suspended')
    or (current_status = 'suspended' and decision = 'approved')
  ) then
    raise exception 'Invalid state transition for %: % -> %', target_kind, current_status, decision using errcode = '22023';
  end if;

  if target_kind = 'seller' then
    update public.seller_applications
    set status = decision,
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        review_note = reason,
        requested_information = case when decision = 'more_information_required' then reason else null end,
        updated_at = now()
    where id = target_id;

    update public.creator_commerce_access
    set seller_status = decision,
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        updated_at = now()
    where user_id = applicant_id;
  elsif target_kind = 'creator' then
    update public.creator_applications
    set status = decision,
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        review_note = reason,
        requested_information = case when decision = 'more_information_required' then reason else null end,
        updated_at = now()
    where id = target_id;

    update public.creator_commerce_access
    set creator_status = decision,
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        updated_at = now()
    where user_id = applicant_id;
  elsif target_kind = 'professional' then
    update public.professional_verification_requests
    set status = decision,
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        review_note = reason,
        requested_information = case when decision = 'more_information_required' then reason else null end,
        updated_at = now()
    where id = target_id;

    update public.creator_commerce_access
    set professional_status = decision,
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        updated_at = now()
    where user_id = applicant_id;
  end if;

  return jsonb_build_object(
    'applicationKind', target_kind,
    'applicationId', target_id,
    'ownerId', applicant_id,
    'previousStatus', current_status,
    'decision', target_decision
  );
end;
$$;

revoke all on function public.review_creator_commerce_application(text, uuid, text, text) from public;
grant execute on function public.review_creator_commerce_application(text, uuid, text, text) to authenticated;
