-- Referral attribution must survive projects that require email confirmation.
-- The code is carried in signup metadata and claimed after the profile trigger
-- has created the matching public profile. Invalid/self/duplicate codes never
-- block account creation.
create or replace function private.claim_signup_reward_referral()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(new.raw_user_meta_data ->> 'reward_referral_code', '')));
  v_referrer uuid;
begin
  if v_code !~ '^[A-Z0-9]{12}$' then
    return new;
  end if;

  select user_id into v_referrer
  from public.reward_referral_codes
  where code = v_code;

  if v_referrer is null or v_referrer = new.id then
    return new;
  end if;

  insert into public.reward_referrals(referred_user_id, referrer_user_id, referral_code)
  values (new.id, v_referrer, v_code)
  on conflict (referred_user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.claim_signup_reward_referral() from public;

drop trigger if exists reward_referral_after_signup on auth.users;
create trigger reward_referral_after_signup
after insert on auth.users
for each row execute function private.claim_signup_reward_referral();
