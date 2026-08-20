-- Sellers publish their own products. Commerce Admin may only suspend an
-- already-live product or reinstate a product that Admin previously suspended.
-- This preserves a narrow safety-moderation capability without making Admin a
-- normal product approval gate.
create or replace function public.review_creator_commerce_product(
  p_product_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.products
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_product public.products;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_user is null or not (select private.is_creator_commerce_admin()) then
    raise exception 'Commerce admin access required.';
  end if;

  select *
    into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found.';
  end if;

  if p_decision = 'suspended' then
    if v_product.product_approval_status <> 'approved' then
      raise exception 'Only an active product may be suspended.';
    end if;
    if v_reason is null then
      raise exception 'A reason is required when suspending a product.';
    end if;

    update public.products
       set product_approval_status = 'suspended',
           status = 'archived',
           reviewed_by = v_user,
           reviewed_at = now(),
           review_note = v_reason,
           suspended_at = now(),
           updated_at = now()
     where id = p_product_id
     returning * into v_product;
  elsif p_decision = 'approved' then
    if v_product.product_approval_status <> 'suspended' then
      raise exception 'Admin can only reinstate a suspended product.';
    end if;

    update public.products
       set product_approval_status = 'approved',
           status = 'active',
           reviewed_by = v_user,
           reviewed_at = now(),
           review_note = v_reason,
           published_at = coalesce(published_at, now()),
           updated_at = now()
     where id = p_product_id
     returning * into v_product;
  else
    raise exception 'Admin product approval is not available. Allowed decisions: suspended, approved (reinstate only).';
  end if;

  return v_product;
end;
$$;
