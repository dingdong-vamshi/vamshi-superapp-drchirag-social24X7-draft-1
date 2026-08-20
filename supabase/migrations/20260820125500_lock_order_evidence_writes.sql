-- Evidence records are immutable once the server-authorized capture/upload RPC
-- creates them. This keeps private proof from being edited through table grants.
revoke insert, update, delete on public.commerce_order_evidence from authenticated;
