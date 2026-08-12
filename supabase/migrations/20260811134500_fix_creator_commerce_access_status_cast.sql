create or replace function private.sync_creator_commerce_access_from_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_status public.commerce_approval_status := new.status::public.commerce_approval_status;
begin
  if next_status = 'draft' then
    return new;
  end if;

  if tg_table_name = 'seller_applications' then
    update public.creator_commerce_access
    set seller_status = next_status,
        updated_at = now()
    where user_id = new.owner_id;

    if next_status = 'approved' then
      perform private.provision_creator_commerce_storefront(new.owner_id);
    elsif next_status = 'suspended' then
      update public.storefronts
      set active = false,
          updated_at = now()
      where owner_id = new.owner_id;
    end if;
  elsif tg_table_name = 'creator_applications' then
    update public.creator_commerce_access
    set creator_status = next_status,
        updated_at = now()
    where user_id = new.owner_id;
  elsif tg_table_name = 'professional_verification_requests' then
    update public.creator_commerce_access
    set professional_status = next_status,
        updated_at = now()
    where user_id = new.owner_id;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_creator_commerce_access_from_application() from public;
