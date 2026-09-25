-- Keep Team Management available for storefronts created after the foundation
-- migration. The bootstrap is idempotent so it also repairs partial fixtures.

create or replace function private.bootstrap_storefront_team(p_storefront_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_storefront public.storefronts%rowtype;
  owner_role_id uuid;
begin
  select storefront.*
  into target_storefront
  from public.storefronts storefront
  where storefront.id = p_storefront_id;

  if not found then
    return;
  end if;

  insert into public.storefront_team_roles (
    storefront_id,
    name,
    system_key,
    description,
    is_system,
    created_by
  )
  select
    target_storefront.id,
    template.name,
    template.system_key,
    template.description,
    true,
    target_storefront.owner_id
  from (values
    ('Owner', 'owner', 'Root business owner. This role cannot be archived.'),
    ('Admin', 'admin', 'Full day-to-day business and team administration.'),
    ('Manager', 'manager', 'Supervises and assigns customer conversations.'),
    ('Agent', 'agent', 'Handles assigned customer conversations.'),
    ('Sales', 'sales', 'Handles sales chats and shares products or orders.'),
    ('Support', 'support', 'Handles support chats, orders and returns.')
  ) as template(name, system_key, description)
  on conflict (storefront_id, system_key) where system_key is not null do nothing;

  insert into public.storefront_team_role_permissions (role_id, permission_code)
  select role.id, permission.code
  from public.storefront_team_roles role
  join public.storefront_team_permissions permission on (
    role.system_key in ('owner', 'admin')
    or (role.system_key = 'manager' and permission.code in (
      'business_chat_reply', 'business_chat_monitor', 'business_chat_assign',
      'business_share_products_orders', 'business_returns_refunds',
      'business_feed_view', 'business_orders_view'
    ))
    or (role.system_key = 'agent' and permission.code in (
      'business_chat_reply', 'business_feed_view'
    ))
    or (role.system_key = 'sales' and permission.code in (
      'business_chat_reply', 'business_share_products_orders',
      'business_feed_view', 'business_orders_view'
    ))
    or (role.system_key = 'support' and permission.code in (
      'business_chat_reply', 'business_returns_refunds',
      'business_feed_view', 'business_orders_view'
    ))
  )
  where role.storefront_id = target_storefront.id
  on conflict do nothing;

  select role.id
  into owner_role_id
  from public.storefront_team_roles role
  where role.storefront_id = target_storefront.id
    and role.system_key = 'owner';

  insert into public.storefront_team_memberships (
    storefront_id,
    auth_user_id,
    role_id,
    full_name,
    verified_display_name,
    work_email,
    login_id,
    customer_tagline,
    job_title,
    employee_id,
    department,
    status,
    identity_kind,
    invited_by,
    approved_by,
    approved_at,
    activated_at
  )
  select
    target_storefront.id,
    target_storefront.owner_id,
    owner_role_id,
    coalesce(nullif(profile.display_name, ''), nullif(profile.username, ''), 'Store owner'),
    nullif(profile.display_name, ''),
    lower(coalesce(auth_identity.email, 'owner-' || left(target_storefront.id::text, 8) || '@social24x7.app')),
    'owner.' || replace(left(target_storefront.id::text, 18), '-', ''),
    'from ' || target_storefront.name,
    'Owner',
    'OWNER',
    'Leadership',
    'verified',
    'owner_personal',
    target_storefront.owner_id,
    target_storefront.owner_id,
    now(),
    now()
  from auth.users auth_identity
  left join public.profiles profile on profile.id = auth_identity.id
  where auth_identity.id = target_storefront.owner_id
  on conflict (storefront_id, auth_user_id) do nothing;
end;
$$;

revoke all on function private.bootstrap_storefront_team(uuid) from public;

create or replace function private.bootstrap_inserted_storefront_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.bootstrap_storefront_team(new.id);
  return new;
end;
$$;

revoke all on function private.bootstrap_inserted_storefront_team() from public;

drop trigger if exists bootstrap_inserted_storefront_team on public.storefronts;
create trigger bootstrap_inserted_storefront_team
after insert on public.storefronts
for each row execute function private.bootstrap_inserted_storefront_team();

do $$
declare
  storefront_id uuid;
begin
  for storefront_id in select id from public.storefronts loop
    perform private.bootstrap_storefront_team(storefront_id);
  end loop;
end;
$$;
