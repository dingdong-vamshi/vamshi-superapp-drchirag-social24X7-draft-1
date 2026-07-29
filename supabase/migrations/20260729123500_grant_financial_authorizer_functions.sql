grant usage on schema private to authenticated;

grant execute on function private.is_chit_member(uuid, uuid) to authenticated;
grant execute on function private.is_chit_manager(uuid, uuid) to authenticated;
grant execute on function private.is_chit_authorized(uuid, uuid) to authenticated;

grant execute on function private.is_bill_member(uuid, uuid) to authenticated;
grant execute on function private.is_bill_owner(uuid, uuid) to authenticated;
grant execute on function private.is_bill_authorized(uuid, uuid) to authenticated;
