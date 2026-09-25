-- Run after the four 202609250801xx migrations. Raises on any failed invariant.
do $$
declare
  storefront_count integer;
  owner_membership_count integer;
  missing_role_sets integer;
  unsafe_grants integer;
begin
  select count(*) into storefront_count from public.storefronts;
  select count(*) into owner_membership_count
  from public.storefront_team_memberships
  where identity_kind = 'owner_personal' and status = 'verified';
  if owner_membership_count <> storefront_count then
    raise exception 'Every storefront must have one root Owner membership: % / %', owner_membership_count, storefront_count;
  end if;

  select count(*) into missing_role_sets
  from public.storefronts storefront
  where (
    select count(*) from public.storefront_team_roles role
    where role.storefront_id = storefront.id and role.is_system
  ) <> 6;
  if missing_role_sets <> 0 then
    raise exception 'Every storefront must have all six built-in roles.';
  end if;

  select count(*) into unsafe_grants
  from information_schema.role_routine_grants grant_row
  where grant_row.routine_schema = 'public'
    and grant_row.routine_name in ('claim_business_team_activation', 'complete_business_team_activation')
    and grant_row.grantee in ('anon', 'authenticated', 'PUBLIC');
  if unsafe_grants <> 0 then
    raise exception 'Activation claim/completion must remain service-role only.';
  end if;

  if not exists (
    select 1 from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'storefront_team_memberships'
      and relation.relrowsecurity
  ) then
    raise exception 'Team membership RLS is not enabled.';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'business_conversation_assignments'
  ) then
    raise exception 'Business assignments are not in Supabase Realtime.';
  end if;
end;
$$;
