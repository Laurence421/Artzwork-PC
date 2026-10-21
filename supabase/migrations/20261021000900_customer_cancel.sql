-- Customers can cancel their own order from its page (the tracking link), until it ships:
-- while it is "pending" (order placed) or "paid" (payment received). Shipped and completed
-- orders can't be cancelled. Stock goes back and the history says the customer cancelled.
-- Whoever has the order's unguessable tracking link can cancel it, like they can view it.

create or replace function public.cancel_order_by_token(p_token text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders
  where tracking_token = p_token and length(p_token) = 64
  for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_order.status not in ('pending', 'paid') then
    raise exception 'CANNOT_CANCEL' using errcode = 'P0001', detail = v_order.status::text;
  end if;
  perform private.set_order_status(v_order.id, 'cancelled', 'Cancelled by the customer', (select auth.uid()));
  return v_order.tracking_token;
end;
$$;

revoke execute on function public.cancel_order_by_token(text) from public;
grant execute on function public.cancel_order_by_token(text) to anon, authenticated;
