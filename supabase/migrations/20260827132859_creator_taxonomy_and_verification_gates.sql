-- Complete Creator taxonomy, sensitive video metadata, and authoritative
-- onboarding approval gates. Existing approved applications are preserved.

create table if not exists public.creator_specialization_policies (
  macro_category text not null,
  specialization text primary key,
  requires_professional_verification boolean not null default false,
  required_credential_types text[] not null default '{}'::text[],
  requires_verification_video boolean not null default false,
  verification_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_specialization_policy_professional_requirements check (
    not requires_professional_verification
    or (cardinality(required_credential_types) > 0 and requires_verification_video and nullif(trim(verification_instructions), '') is not null)
  )
);

alter table public.creator_specialization_policies enable row level security;
drop policy if exists creator_specialization_policies_authenticated_read on public.creator_specialization_policies;
create policy creator_specialization_policies_authenticated_read
on public.creator_specialization_policies for select to authenticated using (true);
revoke all on public.creator_specialization_policies from public, anon, authenticated;
grant select on public.creator_specialization_policies to authenticated;

insert into public.creator_specialization_policies (
  macro_category, specialization, requires_professional_verification,
  required_credential_types, requires_verification_video, verification_instructions
)
values
  ('Fashion & Beauty','Fashion',false,'{}',false,null),
  ('Fashion & Beauty','Beauty',false,'{}',false,null),
  ('Fashion & Beauty','Makeup Artist',false,'{}',false,null),
  ('Fashion & Beauty','Hair Dresser / Stylist',false,'{}',false,null),
  ('Fashion & Beauty','Nail Artist',false,'{}',false,null),
  ('Fashion & Beauty','Personal Care',false,'{}',false,null),
  ('Fashion & Beauty','Model',false,'{}',false,null),
  ('Fashion & Beauty','Tattoo Artist',false,'{}',false,null),
  ('Media & Entertainment','Actor/Actress',false,'{}',false,null),
  ('Media & Entertainment','Comedy',false,'{}',false,null),
  ('Media & Entertainment','Anchor',false,'{}',false,null),
  ('Media & Entertainment','VJ',false,'{}',false,null),
  ('Media & Entertainment','RJ',false,'{}',false,null),
  ('Media & Entertainment','Reality Show Star',false,'{}',false,null),
  ('Media & Entertainment','Dancer',false,'{}',false,null),
  ('Media & Entertainment','Musician',false,'{}',false,null),
  ('Media & Entertainment','Music Composer',false,'{}',false,null),
  ('Media & Entertainment','Singer',false,'{}',false,null),
  ('Media & Entertainment','Rapper',false,'{}',false,null),
  ('Media & Entertainment','DJ',false,'{}',false,null),
  ('Media & Entertainment','Music Band',false,'{}',false,null),
  ('Media & Entertainment','Voice Artist',false,'{}',false,null),
  ('Media & Entertainment','Storyteller',false,'{}',false,null),
  ('Media & Entertainment','Poetry',false,'{}',false,null),
  ('Content & Digital Media','Content Creator',false,'{}',false,null),
  ('Content & Digital Media','Digital Creator',false,'{}',false,null),
  ('Content & Digital Media','Video Creator',false,'{}',false,null),
  ('Content & Digital Media','Vlogger',false,'{}',false,null),
  ('Content & Digital Media','Food Vlogger',false,'{}',false,null),
  ('Content & Digital Media','Moto Vlogger',false,'{}',false,null),
  ('Content & Digital Media','Travel Vlogger',false,'{}',false,null),
  ('Content & Digital Media','YouTube',false,'{}',false,null),
  ('Content & Digital Media','Podcaster',false,'{}',false,null),
  ('Content & Digital Media','UGC Creator',false,'{}',false,null),
  ('Content & Digital Media','AI Influencer',false,'{}',false,null),
  ('Content & Digital Media','Social Media Star',false,'{}',false,null),
  ('Content & Digital Media','Public Figure',false,'{}',false,null),
  ('Content & Digital Media','Blogger',false,'{}',false,null),
  ('Content & Digital Media','Personal Blog',false,'{}',false,null),
  ('Content & Digital Media','Cinematographer/Videographer',false,'{}',false,null),
  ('Content & Digital Media','Photographer',false,'{}',false,null),
  ('Content & Digital Media','Photo Editor',false,'{}',false,null),
  ('Business & Finance','Entrepreneur',false,'{}',false,null),
  ('Business & Finance','Business Content Creator',false,'{}',false,null),
  ('Business & Finance','E-commerce',false,'{}',false,null),
  ('Business & Finance','Finance Creator',false,'{}',false,null),
  ('Business & Finance','Stock Market',false,'{}',false,null),
  ('Business & Finance','Trader',false,'{}',false,null),
  ('Business & Finance','Real Estate',false,'{}',false,null),
  ('Business & Finance','Legal Consultation',true,array['bar_council_enrolment','practice_credential'],true,'Appear in a short spoken walkthrough and show the relevant professional workplace context for Admin review.'),
  ('Health & Wellness','Fitness',false,'{}',false,null),
  ('Health & Wellness','Healthcare',true,array['professional_registration','qualification'],true,'Appear in a short spoken walkthrough and show the relevant professional workplace context for Admin review.'),
  ('Health & Wellness','Medical',true,array['medical_registration','medical_qualification'],true,'Appear in a short spoken walkthrough and show the relevant professional workplace context for Admin review.'),
  ('Health & Wellness','Doctor',true,array['medical_registration','medical_qualification'],true,'Appear in a short spoken walkthrough and show the relevant clinic or professional workplace context for Admin review.'),
  ('Health & Wellness','Nutritionist/Dietician',true,array['nutrition_qualification','professional_registration'],true,'Appear in a short spoken walkthrough and show the relevant professional workplace context for Admin review.'),
  ('Health & Wellness','Mental Wellness Coach',false,'{}',false,null),
  ('Health & Wellness','Counselor/Therapist',true,array['counseling_qualification','professional_registration'],true,'Appear in a short spoken walkthrough and show the relevant professional workplace context for Admin review.'),
  ('Health & Wellness','Sports Person',false,'{}',false,null),
  ('Design, Art & Tech','Graphic Designer',false,'{}',false,null),
  ('Design, Art & Tech','Illustrator',false,'{}',false,null),
  ('Design, Art & Tech','Hand Artist',false,'{}',false,null),
  ('Design, Art & Tech','Digital Artist',false,'{}',false,null),
  ('Design, Art & Tech','NFT Artist',false,'{}',false,null),
  ('Design, Art & Tech','Painter',false,'{}',false,null),
  ('Design, Art & Tech','Artist',false,'{}',false,null),
  ('Design, Art & Tech','Architect',false,'{}',false,null),
  ('Design, Art & Tech','Interior Design',false,'{}',false,null),
  ('Design, Art & Tech','Home Decor',false,'{}',false,null),
  ('Design, Art & Tech','Tech Influencer',false,'{}',false,null),
  ('Design, Art & Tech','Engineer',false,'{}',false,null),
  ('Design, Art & Tech','Gamer',false,'{}',false,null),
  ('Lifestyle & Family','Dad Influencer',false,'{}',false,null),
  ('Lifestyle & Family','Mom Influencer',false,'{}',false,null),
  ('Lifestyle & Family','Parent Influencer',false,'{}',false,null),
  ('Lifestyle & Family','Couple',false,'{}',false,null),
  ('Lifestyle & Family','Lifestyle',false,'{}',false,null),
  ('Lifestyle & Family','Pet Influencer',false,'{}',false,null),
  ('Lifestyle & Family','Culture Content Creator',false,'{}',false,null),
  ('Lifestyle & Family','Environmentalist / Social Activist',false,'{}',false,null),
  ('Lifestyle & Family','Bibliophile',false,'{}',false,null),
  ('Lifestyle & Family','Content Writer',false,'{}',false,null),
  ('Lifestyle & Family','Writer',false,'{}',false,null),
  ('Culinary & Esoteric','Chef',false,'{}',false,null),
  ('Culinary & Esoteric','Astrologer',false,'{}',false,null),
  ('Culinary & Esoteric','Tarot Reader',false,'{}',false,null),
  ('Culinary & Esoteric','Vastu Expert',false,'{}',false,null),
  ('Culinary & Esoteric','Spirituality',false,'{}',false,null),
  ('Culinary & Esoteric','Automobile/Car Enthusiast',false,'{}',false,null),
  ('Culinary & Esoteric','Career Counsellor',false,'{}',false,null),
  ('Culinary & Esoteric','Education',false,'{}',false,null),
  ('Culinary & Esoteric','Motivational Speaker',false,'{}',false,null)
on conflict (specialization) do update set
  macro_category = excluded.macro_category,
  requires_professional_verification = excluded.requires_professional_verification,
  required_credential_types = excluded.required_credential_types,
  requires_verification_video = excluded.requires_verification_video,
  verification_instructions = excluded.verification_instructions,
  updated_at = now();

alter table public.creator_applications
  add column if not exists macro_category text,
  add column if not exists specializations text[] not null default '{}'::text[];

update public.creator_applications
set macro_category = coalesce(nullif(application_payload->>'macroCategory', ''), nullif(category, '')),
    specializations = case
      when jsonb_typeof(application_payload->'specializations') = 'array' then
        array(select jsonb_array_elements_text(application_payload->'specializations'))
      else specializations
    end
where macro_category is null or cardinality(specializations) = 0;

alter table public.creator_commerce_documents
  add column if not exists submitted_at timestamptz not null default now();

update storage.buckets
set public = false,
    file_size_limit = 15728640,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime','application/pdf']
where id = 'creator-commerce-private';

create or replace function private.has_creator_commerce_evidence(
  p_owner uuid,
  p_kind text,
  p_path text,
  p_requires_video boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_path is not null and exists (
    select 1 from public.creator_commerce_documents document
    where document.owner_id = p_owner
      and document.application_kind = p_kind
      and document.storage_path = p_path
      and coalesce(document.file_size, 0) between 1 and 15728640
      and (not p_requires_video or coalesce(document.mime_type, '') in ('video/mp4','video/webm','video/quicktime'))
  );
$$;

create or replace function private.creator_selection_is_valid(p_macro text, p_specializations text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_macro is not null
    and cardinality(coalesce(p_specializations, '{}'::text[])) between 1 and 3
    and (select count(*) from unnest(p_specializations) selected) =
        (select count(distinct selected) from unnest(p_specializations) selected)
    and not exists (
      select 1 from unnest(p_specializations) selected
      where not exists (
        select 1 from public.creator_specialization_policies policy
        where policy.macro_category = p_macro and policy.specialization = selected
      )
    );
$$;

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
      and case when application.seller_type = 'gst' then nullif(trim(application.gstin), '') is not null else nullif(trim(application.pan_number), '') is not null end
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

create or replace function private.professional_request_ready(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select nullif(trim(request.professional_title), '') is not null
      and nullif(trim(request.degree), '') is not null
      and nullif(trim(request.institution), '') is not null
      and nullif(trim(request.registration_number), '') is not null
      and policy.requires_professional_verification
      and policy.requires_verification_video
      and policy.macro_category = creator.macro_category
      and policy.specialization = any(creator.specializations)
      and request.professional_category = policy.specialization
      and private.has_creator_commerce_evidence(request.owner_id, 'professional', request.credential_document_path, false)
      and private.has_creator_commerce_evidence(request.owner_id, 'professional', request.verification_video_path, true)
    from public.professional_verification_requests request
    join public.creator_applications creator on creator.id = request.creator_application_id and creator.owner_id = request.owner_id
    join public.creator_specialization_policies policy on policy.specialization = request.professional_category
    where request.id = p_request_id
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

create or replace function private.link_creator_commerce_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  evidence_paths text[];
  target_kind text;
begin
  if tg_table_name = 'seller_applications' then
    target_kind := 'seller';
    evidence_paths := array[new.document_path, new.exterior_evidence_path, new.interior_evidence_path, new.business_verification_video_path];
  elsif tg_table_name = 'creator_applications' then
    target_kind := 'creator';
    evidence_paths := array[new.identity_document_path];
  else
    target_kind := 'professional';
    evidence_paths := array[new.credential_document_path, new.supporting_document_path, new.verification_video_path];
  end if;
  update public.creator_commerce_documents document
  set application_id = new.id, submitted_at = coalesce(new.submitted_at, document.submitted_at)
  where document.owner_id = new.owner_id
    and document.application_kind = target_kind
    and document.storage_path = any(evidence_paths);
  return new;
end;
$$;

create or replace function private.sync_creator_taxonomy_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if nullif(new.application_payload->>'macroCategory', '') is not null then
    new.macro_category := new.application_payload->>'macroCategory';
    new.category := new.macro_category;
  end if;
  if jsonb_typeof(new.application_payload->'specializations') = 'array' then
    new.specializations := array(select jsonb_array_elements_text(new.application_payload->'specializations'));
  end if;
  return new;
end;
$$;

drop trigger if exists sync_creator_taxonomy_columns on public.creator_applications;
create trigger sync_creator_taxonomy_columns before insert or update of application_payload, macro_category, specializations on public.creator_applications
for each row execute function private.sync_creator_taxonomy_columns();

create or replace function private.validate_creator_commerce_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status not in ('submitted','approved') then return new; end if;
  if tg_table_name = 'seller_applications' and not private.seller_application_ready(new.id) then
    raise exception 'Seller onboarding, required evidence, bank details, and Business Verification video must be complete before submission.' using errcode = '22023';
  elsif tg_table_name = 'creator_applications' and not private.creator_application_ready(new.id) then
    raise exception 'Creator category, identity, and any specialization-required professional evidence must be complete before submission.' using errcode = '22023';
  elsif tg_table_name = 'professional_verification_requests' and not private.professional_request_ready(new.id) then
    raise exception 'Professional credentials and a valid Professional Verification video are required before submission.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists a_link_seller_application_evidence on public.seller_applications;
create trigger a_link_seller_application_evidence after insert or update on public.seller_applications
for each row execute function private.link_creator_commerce_evidence();
drop trigger if exists a_link_creator_application_evidence on public.creator_applications;
create trigger a_link_creator_application_evidence after insert or update on public.creator_applications
for each row execute function private.link_creator_commerce_evidence();
drop trigger if exists a_link_professional_evidence on public.professional_verification_requests;
create trigger a_link_professional_evidence after insert or update on public.professional_verification_requests
for each row execute function private.link_creator_commerce_evidence();

drop trigger if exists z_validate_seller_application_submission on public.seller_applications;
create trigger z_validate_seller_application_submission after insert or update of status, business_verification_video_path, application_payload on public.seller_applications
for each row execute function private.validate_creator_commerce_submission();
drop trigger if exists z_validate_creator_application_submission on public.creator_applications;
create trigger z_validate_creator_application_submission after insert or update of status, macro_category, specializations on public.creator_applications
for each row execute function private.validate_creator_commerce_submission();
drop trigger if exists z_validate_professional_submission on public.professional_verification_requests;
create trigger z_validate_professional_submission after insert or update of status, credential_document_path, verification_video_path on public.professional_verification_requests
for each row execute function private.validate_creator_commerce_submission();

create or replace function public.review_creator_commerce_application(
  target_kind text,
  target_id uuid,
  target_decision text,
  target_reason text default null
)
returns jsonb
language plpgsql
security definer
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
  if target_decision not in ('approved','rejected','more_information_required','suspended','under_review') then
    raise exception 'Unsupported review decision: %', target_decision using errcode = '22023';
  end if;
  if target_decision in ('rejected','more_information_required','suspended') and reason is null then
    raise exception 'A reason is required for this review decision' using errcode = '22023';
  end if;
  decision := target_decision::public.commerce_approval_status;

  if target_kind = 'seller' then
    select owner_id, status into applicant_id, current_status from public.seller_applications where id = target_id;
  elsif target_kind = 'creator' then
    select owner_id, status into applicant_id, current_status from public.creator_applications where id = target_id;
  elsif target_kind = 'professional' then
    select owner_id, status into applicant_id, current_status from public.professional_verification_requests where id = target_id;
  else
    raise exception 'Unsupported application kind: %', target_kind using errcode = '22023';
  end if;
  if applicant_id is null then raise exception 'Commerce application not found' using errcode = 'P0002'; end if;
  if current_status = decision or not (
    (current_status = 'submitted' and decision in ('under_review','approved','more_information_required','rejected'))
    or (current_status = 'under_review' and decision in ('approved','more_information_required','rejected'))
    or (current_status = 'approved' and decision = 'suspended')
    or (current_status = 'suspended' and decision = 'approved')
  ) then
    raise exception 'Invalid state transition for %: % -> %', target_kind, current_status, decision using errcode = '22023';
  end if;
  if decision = 'approved' and target_kind = 'seller' and not private.seller_application_ready(target_id) then
    raise exception 'Seller approval requires complete onboarding and a valid Business Verification video.' using errcode = '22023';
  end if;
  if decision = 'approved' and target_kind = 'creator' and not private.creator_application_ready(target_id) then
    raise exception 'Creator approval requires a valid category, specialization, identity, and required professional submission.' using errcode = '22023';
  end if;
  if decision = 'approved' and target_kind = 'professional' and not private.professional_request_ready(target_id) then
    raise exception 'Professional approval requires matching credentials and a valid Professional Verification video.' using errcode = '22023';
  end if;

  if target_kind = 'seller' then
    update public.seller_applications set status=decision, reviewed_by=auth.uid(), reviewed_at=now(), review_note=reason,
      requested_information=case when decision='more_information_required' then reason else null end, updated_at=now() where id=target_id;
    update public.creator_commerce_access set seller_status=decision, reviewed_by=auth.uid(), reviewed_at=now(), updated_at=now() where user_id=applicant_id;
  elsif target_kind = 'creator' then
    update public.creator_applications set status=decision, reviewed_by=auth.uid(), reviewed_at=now(), review_note=reason,
      requested_information=case when decision='more_information_required' then reason else null end, updated_at=now() where id=target_id;
    update public.creator_commerce_access set creator_status=decision, reviewed_by=auth.uid(), reviewed_at=now(), updated_at=now() where user_id=applicant_id;
  else
    update public.professional_verification_requests set status=decision, reviewed_by=auth.uid(), reviewed_at=now(), review_note=reason,
      requested_information=case when decision='more_information_required' then reason else null end, updated_at=now() where id=target_id;
    update public.creator_commerce_access set professional_status=decision, reviewed_by=auth.uid(), reviewed_at=now(), updated_at=now() where user_id=applicant_id;
  end if;
  return jsonb_build_object('applicationKind',target_kind,'applicationId',target_id,'ownerId',applicant_id,'previousStatus',current_status,'decision',target_decision);
end;
$$;

revoke all on function public.review_creator_commerce_application(text, uuid, text, text) from public, anon;
grant execute on function public.review_creator_commerce_application(text, uuid, text, text) to authenticated;
-- Capability rows are server-owned. Admin decisions go through the guarded RPC;
-- application status triggers keep this table synchronized.
revoke insert, update, delete on public.creator_commerce_access from authenticated;
revoke all on function private.has_creator_commerce_evidence(uuid, text, text, boolean) from public;
revoke all on function private.creator_selection_is_valid(text, text[]) from public;
revoke all on function private.seller_application_ready(uuid) from public;
revoke all on function private.creator_application_ready(uuid) from public;
revoke all on function private.professional_request_ready(uuid) from public;
revoke all on function private.link_creator_commerce_evidence() from public;
revoke all on function private.sync_creator_taxonomy_columns() from public;
revoke all on function private.validate_creator_commerce_submission() from public;
