-- Rejected QA/applicant applications may be corrected and resubmitted, while
-- Admin-authored audit fields stay immutable to the applicant.

create or replace function private.protect_creator_commerce_review_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.owner_id = auth.uid() and not private.is_creator_commerce_admin() then
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_note := old.review_note;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_seller_application_review_fields on public.seller_applications;
create trigger protect_seller_application_review_fields
before update on public.seller_applications
for each row execute function private.protect_creator_commerce_review_fields();

drop trigger if exists protect_creator_application_review_fields on public.creator_applications;
create trigger protect_creator_application_review_fields
before update on public.creator_applications
for each row execute function private.protect_creator_commerce_review_fields();

drop trigger if exists protect_professional_review_fields on public.professional_verification_requests;
create trigger protect_professional_review_fields
before update on public.professional_verification_requests
for each row execute function private.protect_creator_commerce_review_fields();

drop policy if exists seller_applications_owner_update on public.seller_applications;
create policy seller_applications_owner_update
on public.seller_applications for update to authenticated
using (owner_id = auth.uid() and status in ('draft','more_information_required','rejected'))
with check (owner_id = auth.uid() and status in ('draft','submitted'));

drop policy if exists creator_applications_owner_update on public.creator_applications;
create policy creator_applications_owner_update
on public.creator_applications for update to authenticated
using (owner_id = auth.uid() and status in ('draft','more_information_required','rejected'))
with check (owner_id = auth.uid() and status in ('draft','submitted'));

drop policy if exists professional_verification_owner_update on public.professional_verification_requests;
create policy professional_verification_owner_update
on public.professional_verification_requests for update to authenticated
using (owner_id = auth.uid() and status in ('draft','more_information_required','rejected'))
with check (owner_id = auth.uid() and status in ('draft','submitted'));

revoke all on function private.protect_creator_commerce_review_fields() from public;
