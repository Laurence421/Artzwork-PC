-- Cheap "has anything changed?" checks, so open pages update themselves without reloading
-- everything every few seconds: the page only re-renders when this value moves.

-- An order's version: when its status last changed (paid, shipped, courier saved, cancelled ...).
-- Whoever has the tracking link can ask, like they can view the order.
create or replace function public.order_version(p_token text) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select status_changed_at from public.orders where tracking_token = p_token and length(p_token) = 64;
$$;
revoke execute on function public.order_version(text) from public;
grant execute on function public.order_version(text) to anon, authenticated;

-- The signed-in customer's orders version: the latest change across their own orders.
create or replace function public.my_orders_version() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(o.status_changed_at) from public.orders o
  join public.customers c on c.id = o.customer_id
  where c.user_id = (select auth.uid());
$$;
revoke execute on function public.my_orders_version() from public, anon;
grant execute on function public.my_orders_version() to authenticated;

-- Keep the payment SMS log small: entries older than 90 days are removed every night.
create or replace function private.prune_payment_sms() returns void
language sql security definer set search_path = '' as $$
  delete from public.payment_sms where received_at < now() - interval '90 days';
$$;
revoke execute on function private.prune_payment_sms() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('prune-payment-sms', '30 3 * * *', 'select private.prune_payment_sms()');
  end if;
end;
$$;
