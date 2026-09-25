-- Close personal-data escape hatches, preserve authoritative representative
-- attribution and expose only company-scoped feed/order projections.

create or replace function private.storefront_team_member_permission(
  target_member uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.storefront_team_memberships member
    where member.id = target_member
      and member.status = 'verified'
      and coalesce(
        (
          select override.allowed
          from public.storefront_team_member_permissions override
          where override.membership_id = member.id
            and override.permission_code = target_permission
        ),
        exists (
          select 1
          from public.storefront_team_role_permissions role_permission
          where role_permission.role_id = member.role_id
            and role_permission.permission_code = target_permission
        ),
        false
      )
  );
$$;

revoke all on function private.storefront_team_member_permission(uuid, text) from public;

drop policy if exists profiles_business_work_isolation on public.profiles;
create policy profiles_business_work_isolation
on public.profiles as restrictive for select to authenticated
using (not private.is_business_work_identity());

drop policy if exists posts_business_work_isolation on public.posts;
create policy posts_business_work_isolation
on public.posts as restrictive for select to authenticated
using (not private.is_business_work_identity());

drop policy if exists products_business_work_isolation on public.products;
create policy products_business_work_isolation
on public.products as restrictive for select to authenticated
using (
  not private.is_business_work_identity()
  or exists (
    select 1
    from public.storefront_team_memberships member
    where member.auth_user_id = auth.uid()
      and member.storefront_id = products.storefront_id
      and member.status = 'verified'
  )
);

drop policy if exists storefronts_business_work_isolation on public.storefronts;
create policy storefronts_business_work_isolation
on public.storefronts as restrictive for select to authenticated
using (
  not private.is_business_work_identity()
  or exists (
    select 1
    from public.storefront_team_memberships member
    where member.auth_user_id = auth.uid()
      and member.storefront_id = storefronts.id
      and member.status = 'verified'
  )
);

create or replace function private.business_representative_payload(
  target_sender uuid,
  target_conversation uuid,
  target_payload jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conversation public.conversations%rowtype;
  representative record;
begin
  select * into conversation from public.conversations where id = target_conversation;
  if conversation.kind <> 'business'
    or conversation.business_context <> 'buyer_seller'
    or conversation.business_customer_id = target_sender then
    return coalesce(target_payload, '{}'::jsonb) - 'business_representative';
  end if;
  select
    member.id,
    coalesce(member.verified_display_name, member.full_name) as display_name,
    member.customer_tagline,
    storefront.name as company_name,
    member.status = 'verified'
      and storefront.active
      and storefront.verification_status = 'approved' as verified
  into representative
  from public.storefront_team_memberships member
  join public.storefronts storefront on storefront.id = member.storefront_id
  where member.auth_user_id = target_sender
    and member.storefront_id = conversation.storefront_id
  limit 1;
  if representative.id is null then
    return coalesce(target_payload, '{}'::jsonb) - 'business_representative';
  end if;
  return (coalesce(target_payload, '{}'::jsonb) - 'business_representative')
    || jsonb_build_object(
      'business_representative', jsonb_build_object(
        'membership_id', representative.id,
        'name', representative.display_name,
        'tagline', representative.customer_tagline,
        'company', representative.company_name,
        'verified', representative.verified
      )
    );
end;
$$;

create or replace function private.chat_send_permitted(target_user uuid, target_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user is not null
    and exists (
      select 1
      from public.conversations conversation
      join public.conversation_participants participant
        on participant.conversation_id = conversation.id
      where conversation.id = target_conversation
        and participant.user_id = target_user
        and (
          (
            conversation.kind = 'business'
            and conversation.business_context = 'buyer_seller'
            and (
              conversation.business_customer_id = target_user
              or exists (
                select 1
                from public.business_conversation_assignments assignment
                join public.storefront_team_memberships member
                  on member.id = assignment.assignee_membership_id
                where assignment.conversation_id = conversation.id
                  and assignment.status = 'open'
                  and member.auth_user_id = target_user
                  and member.status = 'verified'
                  and private.storefront_team_member_permission(member.id, 'business_chat_reply')
              )
            )
          )
          or (
            not (conversation.kind = 'business' and conversation.business_context = 'buyer_seller')
            and (
              conversation.kind <> 'personal'
              or not exists (
                select 1
                from public.conversation_participants counterpart
                join public.connection_requests request
                  on (
                    request.requester_id = target_user
                    and request.recipient_id = counterpart.user_id
                  ) or (
                    request.recipient_id = target_user
                    and request.requester_id = counterpart.user_id
                  )
                where counterpart.conversation_id = target_conversation
                  and counterpart.user_id <> target_user
                  and request.status = 'blocked'
              )
            )
          )
        )
    );
$$;

create or replace function private.deliver_chat_text_message(
  target_sender uuid,
  target_conversation uuid,
  target_body text,
  target_payload jsonb,
  target_client_id uuid
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted public.messages;
  safe_payload jsonb;
begin
  if not private.chat_send_permitted(target_sender, target_conversation) then
    raise exception 'Conversation delivery is no longer permitted.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(target_body, ''))) not between 1 and 2000 then
    raise exception 'Message cannot be empty or exceed 2000 characters.' using errcode = '22023';
  end if;
  safe_payload := private.business_representative_payload(
    target_sender, target_conversation, target_payload
  );
  insert into public.messages(conversation_id, sender_id, kind, body, payload, client_id)
  values(
    target_conversation,
    target_sender,
    'text'::public.message_kind,
    btrim(target_body),
    safe_payload,
    coalesce(target_client_id, gen_random_uuid())
  )
  returning * into inserted;
  update public.conversations
  set updated_at = inserted.created_at
  where id = target_conversation;
  return inserted;
end;
$$;

create or replace function public.send_personal_message(
  target_conversation uuid,
  message_body text,
  message_kind text default 'text',
  message_payload jsonb default '{}'::jsonb,
  message_client_id uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  inserted public.messages;
  safe_kind public.message_kind;
  safe_payload jsonb;
begin
  if viewer is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not private.chat_send_permitted(viewer, target_conversation) then
    raise exception 'You are not permitted to send to this conversation.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(message_body, '')), '') is null then
    raise exception 'Message cannot be empty.' using errcode = '22023';
  end if;
  safe_kind := case
    when message_kind in ('text', 'image', 'file', 'voice', 'product', 'cart')
      then message_kind::public.message_kind
    else 'text'::public.message_kind
  end;
  if safe_kind = 'text'::public.message_kind then
    return private.deliver_chat_text_message(
      viewer, target_conversation, message_body, message_payload,
      coalesce(message_client_id, gen_random_uuid())
    );
  end if;
  safe_payload := private.business_representative_payload(
    viewer, target_conversation, message_payload
  );
  insert into public.messages(conversation_id, sender_id, kind, body, payload, client_id)
  values(
    target_conversation, viewer, safe_kind, btrim(message_body),
    safe_payload, coalesce(message_client_id, gen_random_uuid())
  ) returning * into inserted;
  update public.conversations
  set updated_at = inserted.created_at
  where id = target_conversation;
  return inserted;
end;
$$;

create or replace function public.get_storefront_team_chat_metrics(target_storefront uuid)
returns table (
  membership_id uuid,
  open_chats bigint,
  resolved_chats bigint,
  lifetime_chats bigint,
  waiting_for_reply bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (
      private.storefront_team_permission(target_storefront, 'business_team_manage')
      or private.storefront_team_permission(target_storefront, 'business_chat_monitor')
    ) then
    raise exception 'Supervisor permission required.' using errcode = '42501';
  end if;
  return query
  select
    member.id,
    count(assignment.conversation_id) filter (where assignment.status = 'open'),
    count(assignment.conversation_id) filter (where assignment.status = 'resolved'),
    count(assignment.conversation_id),
    count(assignment.conversation_id) filter (
      where assignment.status = 'open'
        and exists (
          select 1
          from public.messages latest
          join public.conversations conversation on conversation.id = assignment.conversation_id
          where latest.id = (
            select message.id from public.messages message
            where message.conversation_id = assignment.conversation_id
              and message.deleted_at is null
            order by message.created_at desc limit 1
          )
            and latest.sender_id = conversation.business_customer_id
        )
    )
  from public.storefront_team_memberships member
  left join public.business_conversation_assignments assignment
    on assignment.assignee_membership_id = member.id
  where member.storefront_id = target_storefront
  group by member.id;
end;
$$;

create or replace function public.get_business_company_feed()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  member public.storefront_team_memberships%rowtype;
  result jsonb;
begin
  select * into member
  from public.storefront_team_memberships membership
  where membership.auth_user_id = auth.uid()
    and membership.identity_kind = 'work'
    and membership.status = 'verified'
  limit 1;
  if member.id is null
    or not private.storefront_team_permission(member.storefront_id, 'business_feed_view') then
    raise exception 'Company feed permission required.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'storefront', jsonb_build_object(
      'id', storefront.id,
      'name', storefront.name,
      'slug', storefront.slug,
      'tagline', storefront.tagline,
      'logoPath', storefront.logo_path,
      'verified', storefront.active and storefront.verification_status = 'approved'
    ),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', product.id,
        'title', product.title,
        'slug', product.slug,
        'shortDescription', product.short_description,
        'priceMinor', coalesce(product.sale_price_minor, product.price_minor),
        'currency', product.currency,
        'coverPath', product.cover_path,
        'inventoryAvailable', greatest(product.inventory - product.inventory_reserved, 0)
      ) order by product.updated_at desc)
      from public.products product
      where product.storefront_id = storefront.id and product.status = 'active'
    ), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', post.id,
        'body', post.body,
        'mediaPaths', post.media_paths,
        'mediaType', post.media_type,
        'createdAt', post.created_at
      ) order by post.created_at desc)
      from (
        select company_post.*
        from public.posts company_post
        where company_post.author_id = storefront.owner_id
          and company_post.visibility = 'public'
        order by company_post.created_at desc
        limit 40
      ) post
    ), '[]'::jsonb)
  ) into result
  from public.storefronts storefront
  where storefront.id = member.storefront_id;
  return result;
end;
$$;

create or replace function public.get_business_safe_order_context(target_order uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  member public.storefront_team_memberships%rowtype;
  result jsonb;
begin
  select * into member
  from public.storefront_team_memberships membership
  where membership.auth_user_id = auth.uid()
    and membership.identity_kind = 'work'
    and membership.status = 'verified'
  limit 1;
  if member.id is null
    or not (
      private.storefront_team_permission(member.storefront_id, 'business_orders_view')
      or private.storefront_team_permission(member.storefront_id, 'business_share_products_orders')
    ) then
    raise exception 'Order context permission required.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', commerce_order.id,
    'status', commerce_order.status,
    'createdAt', commerce_order.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'title', item.product_title_snapshot,
        'quantity', item.quantity
      ) order by item.created_at)
      from public.order_items item
      where item.order_id = commerce_order.id
    ), '[]'::jsonb)
  ) into result
  from public.orders commerce_order
  where commerce_order.id = target_order
    and commerce_order.storefront_id = member.storefront_id;
  return result;
end;
$$;

create or replace function public.update_storefront_team_role(
  target_role uuid,
  p_name text,
  p_description text,
  p_permissions text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  role public.storefront_team_roles%rowtype;
  permission text;
begin
  select * into role from public.storefront_team_roles where id = target_role for update;
  if role.id is null
    or not private.storefront_team_permission(role.storefront_id, 'business_team_manage') then
    raise exception 'Team management permission required.' using errcode = '42501';
  end if;
  if role.system_key = 'owner' then
    raise exception 'The Owner role is protected.' using errcode = '42501';
  end if;
  foreach permission in array coalesce(p_permissions, array[]::text[]) loop
    if not exists (select 1 from public.storefront_team_permissions catalog where catalog.code = permission) then
      raise exception 'Unknown permission: %', permission using errcode = '22023';
    end if;
    if not exists (select 1 from public.storefronts storefront where storefront.id = role.storefront_id and storefront.owner_id = auth.uid())
      and not private.storefront_team_permission(role.storefront_id, permission) then
      raise exception 'Cannot grant a permission you do not hold.' using errcode = '42501';
    end if;
  end loop;
  update public.storefront_team_roles
  set name = case when is_system then name else btrim(p_name) end,
      description = coalesce(btrim(p_description), ''),
      updated_at = now()
  where id = role.id;
  delete from public.storefront_team_role_permissions where role_id = role.id;
  insert into public.storefront_team_role_permissions(role_id, permission_code)
  select role.id, selected from unnest(coalesce(p_permissions, array[]::text[])) selected;
  insert into public.storefront_team_audit_events(
    storefront_id, actor_user_id, event_type, detail
  ) values (
    role.storefront_id, auth.uid(), 'role_updated', jsonb_build_object('roleId', role.id)
  );
end;
$$;

create or replace function public.archive_storefront_team_role(target_role uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  role public.storefront_team_roles%rowtype;
begin
  select * into role from public.storefront_team_roles where id = target_role for update;
  if role.id is null
    or not private.storefront_team_permission(role.storefront_id, 'business_team_manage') then
    raise exception 'Team management permission required.' using errcode = '42501';
  end if;
  if role.is_system then
    raise exception 'Built-in roles cannot be archived.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.storefront_team_memberships member
    where member.role_id = role.id and member.status <> 'removed'
  ) then
    raise exception 'Reassign active members before archiving this role.' using errcode = '23503';
  end if;
  update public.storefront_team_roles set archived_at = now(), updated_at = now() where id = role.id;
  insert into public.storefront_team_audit_events(
    storefront_id, actor_user_id, event_type, detail
  ) values (
    role.storefront_id, auth.uid(), 'role_archived', jsonb_build_object('roleId', role.id)
  );
end;
$$;

revoke all on function public.get_storefront_team_chat_metrics(uuid) from public, anon;
revoke all on function public.get_business_company_feed() from public, anon;
revoke all on function public.get_business_safe_order_context(uuid) from public, anon;
revoke all on function public.update_storefront_team_role(uuid, text, text, text[]) from public, anon;
revoke all on function public.archive_storefront_team_role(uuid) from public, anon;
grant execute on function public.get_storefront_team_chat_metrics(uuid) to authenticated;
grant execute on function public.get_business_company_feed() to authenticated;
grant execute on function public.get_business_safe_order_context(uuid) to authenticated;
grant execute on function public.update_storefront_team_role(uuid, text, text, text[]) to authenticated;
grant execute on function public.archive_storefront_team_role(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'business_conversation_assignments'
  ) then
    alter publication supabase_realtime add table public.business_conversation_assignments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'business_conversation_assignment_events'
  ) then
    alter publication supabase_realtime add table public.business_conversation_assignment_events;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'storefront_team_memberships'
  ) then
    alter publication supabase_realtime add table public.storefront_team_memberships;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'storefront_team_audit_events'
  ) then
    alter publication supabase_realtime add table public.storefront_team_audit_events;
  end if;
end;
$$;
