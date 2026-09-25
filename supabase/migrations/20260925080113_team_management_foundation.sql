-- Team Management foundation. Work identities are separate Supabase Auth users;
-- personal seller owners receive a root membership for administration only.

create type public.storefront_team_member_status as enum (
  'not_activated',
  'awaiting_approval',
  'verified',
  'suspended',
  'removed'
);

create table public.storefront_team_permissions (
  code text primary key,
  label text not null,
  description text not null,
  created_at timestamptz not null default now(),
  constraint storefront_team_permissions_code_check
    check (code ~ '^business_[a-z0-9_]+$')
);

insert into public.storefront_team_permissions (code, label, description) values
  ('business_chat_reply', 'Reply to customers', 'Read and reply to actively assigned customer conversations.'),
  ('business_chat_monitor', 'Monitor customer chats', 'Read authorised company conversations in supervisor mode.'),
  ('business_chat_assign', 'Assign customer chats', 'Assign and reassign conversations to verified representatives.'),
  ('business_share_products_orders', 'Share products and orders', 'Share safe product and order context with customers.'),
  ('business_returns_refunds', 'Approve returns and refunds', 'Review returns and perform authorised refund workflows.'),
  ('business_team_manage', 'Manage team', 'Invite, approve, suspend and manage team access.'),
  ('business_feed_view', 'View company feed', 'View the company feed and published company content.'),
  ('business_orders_view', 'View order context', 'View the minimum order context required for customer support.')
on conflict (code) do update set
  label = excluded.label,
  description = excluded.description;

create table public.storefront_team_roles (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references public.storefronts(id) on delete cascade,
  name text not null,
  system_key text,
  description text not null default '',
  is_system boolean not null default false,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint storefront_team_roles_name_check
    check (length(btrim(name)) between 2 and 60),
  constraint storefront_team_roles_system_key_check
    check (system_key is null or system_key in ('owner', 'admin', 'manager', 'agent', 'sales', 'support')),
  constraint storefront_team_roles_system_consistency_check
    check ((is_system and system_key is not null) or (not is_system and system_key is null)),
  unique (id, storefront_id)
);

create unique index storefront_team_roles_name_key
  on public.storefront_team_roles (storefront_id, lower(name))
  where archived_at is null;

create unique index storefront_team_roles_system_key
  on public.storefront_team_roles (storefront_id, system_key)
  where system_key is not null;

create table public.storefront_team_role_permissions (
  role_id uuid not null references public.storefront_team_roles(id) on delete cascade,
  permission_code text not null references public.storefront_team_permissions(code) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_code)
);

create table public.storefront_team_memberships (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references public.storefronts(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  role_id uuid not null,
  full_name text not null,
  verified_display_name text,
  work_email text not null,
  login_id text not null,
  customer_tagline text not null,
  job_title text not null,
  employee_id text,
  department text not null,
  status public.storefront_team_member_status not null default 'not_activated',
  identity_kind text not null default 'work',
  invited_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz,
  removed_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint storefront_team_memberships_role_storefront_fk
    foreign key (role_id, storefront_id)
    references public.storefront_team_roles(id, storefront_id)
    on delete restrict,
  constraint storefront_team_memberships_name_check
    check (length(btrim(full_name)) between 2 and 100),
  constraint storefront_team_memberships_email_check
    check (work_email = lower(btrim(work_email)) and position('@' in work_email) > 1),
  constraint storefront_team_memberships_login_check
    check (login_id = lower(btrim(login_id)) and login_id ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
  constraint storefront_team_memberships_identity_kind_check
    check (identity_kind in ('work', 'owner_personal')),
  constraint storefront_team_memberships_owner_identity_check
    check (identity_kind <> 'owner_personal' or status = 'verified'),
  unique (storefront_id, auth_user_id),
  unique (id, storefront_id),
  unique (storefront_id, employee_id)
);

create unique index storefront_team_memberships_login_id_key
  on public.storefront_team_memberships (lower(login_id));

create unique index storefront_team_memberships_work_email_key
  on public.storefront_team_memberships (storefront_id, lower(work_email));

create unique index storefront_team_memberships_work_auth_key
  on public.storefront_team_memberships (auth_user_id)
  where identity_kind = 'work' and auth_user_id is not null;

create index storefront_team_memberships_storefront_status_idx
  on public.storefront_team_memberships (storefront_id, status, created_at desc);

create table public.storefront_team_member_permissions (
  membership_id uuid not null references public.storefront_team_memberships(id) on delete cascade,
  permission_code text not null references public.storefront_team_permissions(code) on delete restrict,
  allowed boolean not null,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (membership_id, permission_code)
);

create table public.storefront_team_invitations (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null unique references public.storefront_team_memberships(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  max_attempts integer not null default 8,
  last_attempt_at timestamptz,
  activation_claim_hash text,
  activation_claim_expires_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint storefront_team_invitations_attempts_check
    check (attempts >= 0 and max_attempts between 3 and 20)
);

create index storefront_team_invitations_active_idx
  on public.storefront_team_invitations (membership_id, expires_at)
  where consumed_at is null and revoked_at is null;

create table public.storefront_team_audit_events (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references public.storefronts(id) on delete cascade,
  membership_id uuid references public.storefront_team_memberships(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint storefront_team_audit_events_type_check
    check (event_type in (
      'invited', 'activation_resent', 'activated', 'approved', 'role_changed',
      'permissions_changed', 'assigned', 'reassigned', 'resolved', 'reopened',
      'suspended', 'removed', 'reactivated', 'role_created', 'role_updated', 'role_archived'
    ))
);

create index storefront_team_audit_events_storefront_idx
  on public.storefront_team_audit_events (storefront_id, created_at desc);

-- Every storefront receives isolated built-in roles and deterministic defaults.
insert into public.storefront_team_roles (
  storefront_id, name, system_key, description, is_system, created_by
)
select
  storefront.id,
  template.name,
  template.system_key,
  template.description,
  true,
  storefront.owner_id
from public.storefronts storefront
cross join (values
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
on conflict do nothing;

-- Preserve existing seller authority as an explicit root membership. This is
-- an administrative personal identity, not an employee work login.
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
  storefront.id,
  storefront.owner_id,
  owner_role.id,
  coalesce(nullif(profile.display_name, ''), nullif(profile.username, ''), 'Store owner'),
  nullif(profile.display_name, ''),
  lower(coalesce(auth_identity.email, 'owner-' || left(storefront.id::text, 8) || '@social24x7.app')),
  'owner.' || replace(left(storefront.id::text, 18), '-', ''),
  'from ' || storefront.name,
  'Owner',
  'OWNER',
  'Leadership',
  'verified',
  'owner_personal',
  storefront.owner_id,
  storefront.owner_id,
  now(),
  now()
from public.storefronts storefront
join public.storefront_team_roles owner_role
  on owner_role.storefront_id = storefront.id
 and owner_role.system_key = 'owner'
left join public.profiles profile on profile.id = storefront.owner_id
left join auth.users auth_identity on auth_identity.id = storefront.owner_id
on conflict (storefront_id, auth_user_id) do nothing;

alter table public.storefront_team_permissions enable row level security;
alter table public.storefront_team_roles enable row level security;
alter table public.storefront_team_role_permissions enable row level security;
alter table public.storefront_team_memberships enable row level security;
alter table public.storefront_team_member_permissions enable row level security;
alter table public.storefront_team_invitations enable row level security;
alter table public.storefront_team_audit_events enable row level security;

revoke all on table public.storefront_team_permissions from anon, authenticated;
revoke all on table public.storefront_team_roles from anon, authenticated;
revoke all on table public.storefront_team_role_permissions from anon, authenticated;
revoke all on table public.storefront_team_memberships from anon, authenticated;
revoke all on table public.storefront_team_member_permissions from anon, authenticated;
revoke all on table public.storefront_team_invitations from anon, authenticated;
revoke all on table public.storefront_team_audit_events from anon, authenticated;

grant select on table public.storefront_team_permissions to authenticated;
grant select on table public.storefront_team_roles to authenticated;
grant select on table public.storefront_team_role_permissions to authenticated;
grant select on table public.storefront_team_memberships to authenticated;
grant select on table public.storefront_team_member_permissions to authenticated;
grant select on table public.storefront_team_audit_events to authenticated;

alter table public.storefront_team_roles replica identity full;
alter table public.storefront_team_memberships replica identity full;
alter table public.storefront_team_audit_events replica identity full;
