alter table public.seller_applications
  alter column status set default 'draft';

alter table public.seller_applications
  add column if not exists seller_type text not null default 'non_gst',
  add column if not exists registered_state text not null default '',
  add column if not exists pan_number text,
  add column if not exists identity_name text not null default '',
  add column if not exists business_name text not null default '',
  add column if not exists pickup_address text not null default '',
  add column if not exists return_address text not null default '',
  add column if not exists document_path text,
  add column if not exists exterior_evidence_path text,
  add column if not exists interior_evidence_path text,
  add column if not exists location_latitude double precision,
  add column if not exists location_longitude double precision,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text,
  add column if not exists requested_information text,
  add column if not exists application_payload jsonb not null default '{}'::jsonb;

alter table public.seller_applications
  drop constraint if exists seller_applications_status_check;

alter table public.seller_applications
  add constraint seller_applications_status_check
  check (status in (
    'draft',
    'submitted',
    'under_review',
    'more_information_required',
    'approved',
    'rejected',
    'suspended'
  ));

alter table public.seller_applications
  drop constraint if exists seller_applications_seller_type_check;

alter table public.seller_applications
  add constraint seller_applications_seller_type_check
  check (seller_type in ('gst', 'non_gst'));

create table if not exists public.creator_applications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  creator_type text not null default 'general',
  category text not null default '',
  about text not null default '',
  social_handles jsonb not null default '{}'::jsonb,
  identity_name text not null default '',
  identity_document_path text,
  status public.commerce_approval_status not null default 'draft',
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  requested_information text,
  application_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_applications_owner_unique unique (owner_id),
  constraint creator_applications_creator_type_check check (creator_type in ('general', 'professional'))
);

create table if not exists public.professional_verification_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  creator_application_id uuid references public.creator_applications(id) on delete set null,
  professional_category text not null default '',
  professional_title text not null default '',
  degree text not null default '',
  institution text not null default '',
  graduation_year integer,
  registration_number text not null default '',
  credential_document_path text,
  supporting_document_path text,
  social_handles jsonb not null default '{}'::jsonb,
  status public.commerce_approval_status not null default 'draft',
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  requested_information text,
  application_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_verification_owner_unique unique (owner_id)
);

create table if not exists public.creator_commerce_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  application_kind text not null,
  application_id uuid,
  document_kind text not null,
  storage_path text not null,
  file_name text,
  mime_type text,
  file_size integer,
  created_at timestamptz not null default now(),
  constraint creator_commerce_documents_kind_check check (
    application_kind in ('seller', 'creator', 'professional')
  )
);

create index if not exists seller_applications_status_idx
  on public.seller_applications (status, updated_at desc);

create index if not exists creator_applications_owner_status_idx
  on public.creator_applications (owner_id, status, updated_at desc);

create index if not exists creator_applications_status_idx
  on public.creator_applications (status, updated_at desc);

create index if not exists professional_verification_owner_status_idx
  on public.professional_verification_requests (owner_id, status, updated_at desc);

create index if not exists professional_verification_status_idx
  on public.professional_verification_requests (status, updated_at desc);

create index if not exists creator_commerce_documents_owner_idx
  on public.creator_commerce_documents (owner_id, application_kind, created_at desc);

create or replace function private.set_creator_commerce_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_creator_applications_updated_at on public.creator_applications;
create trigger set_creator_applications_updated_at
before update on public.creator_applications
for each row execute function private.set_creator_commerce_updated_at();

drop trigger if exists set_professional_verification_updated_at on public.professional_verification_requests;
create trigger set_professional_verification_updated_at
before update on public.professional_verification_requests
for each row execute function private.set_creator_commerce_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creator-commerce-private',
  'creator-commerce-private',
  false,
  15728640,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'application/pdf'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.seller_applications enable row level security;
alter table public.creator_applications enable row level security;
alter table public.professional_verification_requests enable row level security;
alter table public.creator_commerce_documents enable row level security;

drop policy if exists seller_applications_owner_read on public.seller_applications;
drop policy if exists seller_applications_owner_insert on public.seller_applications;
drop policy if exists seller_applications_owner_update on public.seller_applications;
drop policy if exists seller_applications_admin_read on public.seller_applications;
drop policy if exists seller_applications_admin_update on public.seller_applications;

create policy seller_applications_owner_read
on public.seller_applications
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy seller_applications_admin_read
on public.seller_applications
for select
to authenticated
using ((select private.is_creator_commerce_admin()));

create policy seller_applications_owner_insert
on public.seller_applications
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and status in ('draft', 'submitted')
);

create policy seller_applications_owner_update
on public.seller_applications
for update
to authenticated
using (
  owner_id = (select auth.uid())
  and status in ('draft', 'more_information_required')
)
with check (
  owner_id = (select auth.uid())
  and status in ('draft', 'submitted')
);

create policy seller_applications_admin_update
on public.seller_applications
for update
to authenticated
using ((select private.is_creator_commerce_admin()))
with check ((select private.is_creator_commerce_admin()));

create policy creator_applications_owner_read
on public.creator_applications
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy creator_applications_admin_read
on public.creator_applications
for select
to authenticated
using ((select private.is_creator_commerce_admin()));

create policy creator_applications_owner_insert
on public.creator_applications
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and status in ('draft', 'submitted')
);

create policy creator_applications_owner_update
on public.creator_applications
for update
to authenticated
using (
  owner_id = (select auth.uid())
  and status in ('draft', 'more_information_required')
)
with check (
  owner_id = (select auth.uid())
  and status in ('draft', 'submitted')
);

create policy creator_applications_admin_update
on public.creator_applications
for update
to authenticated
using ((select private.is_creator_commerce_admin()))
with check ((select private.is_creator_commerce_admin()));

create policy professional_verification_owner_read
on public.professional_verification_requests
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy professional_verification_admin_read
on public.professional_verification_requests
for select
to authenticated
using ((select private.is_creator_commerce_admin()));

create policy professional_verification_owner_insert
on public.professional_verification_requests
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and status in ('draft', 'submitted')
);

create policy professional_verification_owner_update
on public.professional_verification_requests
for update
to authenticated
using (
  owner_id = (select auth.uid())
  and status in ('draft', 'more_information_required')
)
with check (
  owner_id = (select auth.uid())
  and status in ('draft', 'submitted')
);

create policy professional_verification_admin_update
on public.professional_verification_requests
for update
to authenticated
using ((select private.is_creator_commerce_admin()))
with check ((select private.is_creator_commerce_admin()));

create policy creator_commerce_documents_owner_read
on public.creator_commerce_documents
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy creator_commerce_documents_admin_read
on public.creator_commerce_documents
for select
to authenticated
using ((select private.is_creator_commerce_admin()));

create policy creator_commerce_documents_owner_insert
on public.creator_commerce_documents
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and storage_path like ((select auth.uid())::text || '/%')
);

drop policy if exists creator_commerce_private_owner_read on storage.objects;
drop policy if exists creator_commerce_private_admin_read on storage.objects;
drop policy if exists creator_commerce_private_owner_insert on storage.objects;
drop policy if exists creator_commerce_private_owner_update on storage.objects;

create policy creator_commerce_private_owner_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'creator-commerce-private'
  and owner = (select auth.uid())
);

create policy creator_commerce_private_admin_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'creator-commerce-private'
  and (select private.is_creator_commerce_admin())
);

create policy creator_commerce_private_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'creator-commerce-private'
  and owner = (select auth.uid())
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy creator_commerce_private_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'creator-commerce-private'
  and owner = (select auth.uid())
)
with check (
  bucket_id = 'creator-commerce-private'
  and owner = (select auth.uid())
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

grant select, insert, update on public.seller_applications to authenticated;
grant select, insert, update on public.creator_applications to authenticated;
grant select, insert, update on public.professional_verification_requests to authenticated;
grant select, insert on public.creator_commerce_documents to authenticated;

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
    update public.seller_applications
    set status = target_decision,
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        review_note = reason,
        requested_information = case when target_decision = 'more_information_required' then reason else null end,
        updated_at = now()
    where id = target_id
    returning owner_id into applicant_id;

    if applicant_id is null then
      raise exception 'Seller application not found' using errcode = 'P0002';
    end if;

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
        requested_information = case when target_decision = 'more_information_required' then reason else null end
    where id = target_id
    returning owner_id into applicant_id;

    if applicant_id is null then
      raise exception 'Creator application not found' using errcode = 'P0002';
    end if;

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
        requested_information = case when target_decision = 'more_information_required' then reason else null end
    where id = target_id
    returning owner_id into applicant_id;

    if applicant_id is null then
      raise exception 'Professional verification request not found' using errcode = 'P0002';
    end if;

    update public.creator_commerce_access
    set professional_status = decision,
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        updated_at = now()
    where user_id = applicant_id;
  else
    raise exception 'Unsupported application kind: %', target_kind using errcode = '22023';
  end if;

  return jsonb_build_object(
    'applicationKind', target_kind,
    'applicationId', target_id,
    'ownerId', applicant_id,
    'decision', target_decision
  );
end;
$$;

revoke all on function public.review_creator_commerce_application(text, uuid, text, text) from public;
grant execute on function public.review_creator_commerce_application(text, uuid, text, text) to authenticated;
