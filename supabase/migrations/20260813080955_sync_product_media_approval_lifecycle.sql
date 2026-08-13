-- Keep Product media moderation metadata aligned with the authoritative
-- Product approval lifecycle. Product visibility still depends on both the
-- Product state and the private Storage/RLS policies.

create or replace function private.sync_product_media_moderation_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_media_state text;
begin
  next_media_state := case new.product_approval_status
    when 'draft' then 'draft'
    when 'submitted' then 'submitted'
    when 'under_review' then 'submitted'
    when 'approved' then 'approved'
    when 'changes_required' then 'rejected'
    when 'rejected' then 'rejected'
    -- Suspension removes the Product from delivery, but does not undo a
    -- completed media moderation decision.
    when 'suspended' then 'approved'
    else null
  end;

  if next_media_state is not null then
    update public.product_media
    set moderation_state = next_media_state
    where product_id = new.id
      and moderation_state is distinct from next_media_state;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_product_media_moderation_state() from public;
revoke all on function private.sync_product_media_moderation_state() from anon, authenticated;

drop trigger if exists products_sync_media_moderation_state on public.products;
create trigger products_sync_media_moderation_state
after update of product_approval_status on public.products
for each row
when (old.product_approval_status is distinct from new.product_approval_status)
execute function private.sync_product_media_moderation_state();

-- Repair rows created before lifecycle synchronization existed.
update public.product_media media
set moderation_state = case product.product_approval_status
      when 'draft' then 'draft'
      when 'submitted' then 'submitted'
      when 'under_review' then 'submitted'
      when 'approved' then 'approved'
      when 'changes_required' then 'rejected'
      when 'rejected' then 'rejected'
      when 'suspended' then 'approved'
      else media.moderation_state
    end
from public.products product
where product.id = media.product_id
  and media.moderation_state is distinct from case product.product_approval_status
    when 'draft' then 'draft'
    when 'submitted' then 'submitted'
    when 'under_review' then 'submitted'
    when 'approved' then 'approved'
    when 'changes_required' then 'rejected'
    when 'rejected' then 'rejected'
    when 'suspended' then 'approved'
    else media.moderation_state
  end;
