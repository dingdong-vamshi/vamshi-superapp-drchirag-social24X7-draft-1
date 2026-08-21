-- Make transfer history understandable without denormalizing profile names into
-- the authoritative ledger. Names are resolved at read time from the immutable
-- transfer relationship.
create or replace function public.get_my_reward_history(result_limit integer default 20)
returns table (
  id uuid,
  amount_microunits bigint,
  description text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  perform private.finalize_my_reward_session();

  return query
  select
    l.id,
    l.amount_microunits,
    case
      when l.entry_type = 'transfer_out' and recipient.id is not null then
        'Sent to ' || coalesce(nullif(recipient.display_name, ''), '@' || nullif(recipient.username, ''), 'Social24 user')
      when l.entry_type = 'transfer_in' and sender.id is not null then
        'Received from ' || coalesce(nullif(sender.display_name, ''), '@' || nullif(sender.username, ''), 'Social24 user')
      else l.description
    end,
    l.created_at
  from public.reward_ledger l
  left join public.reward_transfers transfer_record
    on l.idempotency_key in (
      'reward-transfer:out:' || transfer_record.id::text,
      'reward-transfer:in:' || transfer_record.id::text
    )
  left join public.profiles sender on sender.id = transfer_record.sender_id
  left join public.profiles recipient on recipient.id = transfer_record.recipient_id
  where l.user_id = (select auth.uid())
  order by l.created_at desc
  limit greatest(1, least(coalesce(result_limit, 20), 100));
end;
$$;

revoke all on function public.get_my_reward_history(integer) from public, anon;
grant execute on function public.get_my_reward_history(integer) to authenticated;
