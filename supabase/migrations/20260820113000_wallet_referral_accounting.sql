-- Wallet referral accounting is intentionally separate from accepted friends.
-- All relationship writes are mediated by authenticated security-definer RPCs.

create table if not exists public.reward_referral_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{12}$'),
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.reward_referrals (
  referred_user_id uuid primary key references public.profiles(id) on delete cascade,
  referrer_user_id uuid not null references public.profiles(id) on delete restrict,
  referral_code text not null references public.reward_referral_codes(code) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  check (referred_user_id <> referrer_user_id)
);

create index if not exists reward_referrals_referrer_idx
  on public.reward_referrals(referrer_user_id, created_at desc);

alter table public.reward_referral_codes enable row level security;
alter table public.reward_referrals enable row level security;
revoke all on table public.reward_referral_codes from public, anon, authenticated;
revoke all on table public.reward_referrals from public, anon, authenticated;

create or replace function private.ensure_my_reward_referral_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_code text;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  select code into v_code from public.reward_referral_codes where user_id = v_user;
  if v_code is not null then return v_code; end if;

  loop
    v_code := upper(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 12));
    begin
      insert into public.reward_referral_codes(user_id, code) values (v_user, v_code);
      return v_code;
    exception when unique_violation then
      select code into v_code from public.reward_referral_codes where user_id = v_user;
      if v_code is not null then return v_code; end if;
    end;
  end loop;
end;
$$;

create or replace function public.get_my_reward_referral_network()
returns table(total_referred integer, active_referred integer, bonus_bps integer, referral_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_per_active integer := 0;
  v_cap integer := 0;
  v_total integer := 0;
  v_active integer := 0;
  v_code text;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  v_code := private.ensure_my_reward_referral_code();
  select friend_bonus_bps, max_friend_bonus_bps
    into v_per_active, v_cap
  from public.reward_config where singleton = true;

  select count(*)::integer,
    count(*) filter (where exists (
      select 1 from public.reward_sessions s
      where s.user_id = r.referred_user_id and s.status = 'active' and s.ends_at > clock_timestamp()
    ))::integer
  into v_total, v_active
  from public.reward_referrals r where r.referrer_user_id = v_user;

  return query select
    v_total,
    v_active,
    least(v_cap, v_active * v_per_active + floor(v_per_active * v_active::numeric / greatest(v_total, 1))::integer),
    v_code;
end;
$$;

create or replace function public.claim_reward_referral(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_referrer uuid;
  v_existing uuid;
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if v_code !~ '^[A-Z0-9]{12}$' then raise exception 'Invalid Social24 referral code.'; end if;

  select referrer_user_id into v_existing
  from public.reward_referrals where referred_user_id = v_user for update;
  if v_existing is not null then
    return false;
  end if;

  select user_id into v_referrer from public.reward_referral_codes where code = v_code;
  if v_referrer is null then raise exception 'Referral code was not found.'; end if;
  if v_referrer = v_user then raise exception 'You cannot use your own referral code.'; end if;

  insert into public.reward_referrals(referred_user_id, referrer_user_id, referral_code)
  values(v_user, v_referrer, v_code);
  return true;
end;
$$;

create or replace function public.start_reward_session()
returns public.reward_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_base_rate bigint;
  v_per_active integer;
  v_cap integer;
  v_total integer := 0;
  v_active integer := 0;
  v_bonus integer;
  v_rate bigint;
  v_created public.reward_sessions;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  perform private.finalize_my_reward_session();
  if exists (select 1 from public.reward_sessions where user_id = v_user and status = 'active' and ends_at > clock_timestamp()) then
    raise exception 'A reward session is already active.';
  end if;

  select base_rate_microunits_per_hour, friend_bonus_bps, max_friend_bonus_bps
    into v_base_rate, v_per_active, v_cap
  from public.reward_config where singleton = true;
  select count(*)::integer,
    count(*) filter (where exists (
      select 1 from public.reward_sessions s
      where s.user_id = r.referred_user_id and s.status = 'active' and s.ends_at > clock_timestamp()
    ))::integer
  into v_total, v_active
  from public.reward_referrals r where r.referrer_user_id = v_user;

  v_bonus := least(v_cap, v_active * v_per_active + floor(v_per_active * v_active::numeric / greatest(v_total, 1))::integer);
  v_rate := floor(v_base_rate::numeric * (10000 + v_bonus) / 10000)::bigint;
  insert into public.reward_sessions(user_id, started_at, ends_at, rate_microunits_per_hour)
  values(v_user, clock_timestamp(), clock_timestamp() + interval '24 hours', v_rate)
  returning * into v_created;
  return v_created;
end;
$$;

-- QA credit is deliberately admin-gated, ledger-backed, and never available to
-- normal clients. It exists only to exercise transfers without fabricating UI state.
create or replace function public.grant_internal_qa_reward_credit(
  p_recipient_id uuid,
  p_amount_microunits bigint,
  p_note text default null
)
returns public.reward_ledger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.reward_ledger;
begin
  if not private.is_creator_commerce_admin() then raise exception 'Commerce admin access required.'; end if;
  if p_recipient_id is null or not exists (select 1 from public.profiles where id = p_recipient_id) then raise exception 'Recipient was not found.'; end if;
  if p_amount_microunits is null or p_amount_microunits <= 0 or p_amount_microunits > 1000000000 then
    raise exception 'QA credit must be between 0 and 1000 Social24 Coins.';
  end if;
  insert into public.reward_ledger(user_id, entry_type, amount_microunits, idempotency_key, description)
  values(
    p_recipient_id,
    'adjustment',
    p_amount_microunits,
    'internal-qa-credit:' || pg_catalog.gen_random_uuid()::text,
    'Internal QA credit: ' || coalesce(nullif(left(trim(p_note), 100), ''), 'wallet transfer test')
  ) returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_my_reward_referral_network() from public, anon;
revoke all on function public.claim_reward_referral(text) from public, anon;
revoke all on function public.start_reward_session() from public, anon;
revoke all on function public.grant_internal_qa_reward_credit(uuid, bigint, text) from public, anon;
grant execute on function public.get_my_reward_referral_network() to authenticated;
grant execute on function public.claim_reward_referral(text) to authenticated;
grant execute on function public.start_reward_session() to authenticated;
grant execute on function public.grant_internal_qa_reward_credit(uuid, bigint, text) to authenticated;
