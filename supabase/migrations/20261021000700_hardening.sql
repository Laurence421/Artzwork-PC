-- Hardening after the 2026-10-21 pen test.

-- 1. Checkout spam: placing an order reserves stock, so a script placing many fake orders
--    could make the shop look sold out. Limit unpaid (pending) orders created in the last hour,
--    per contact (email or phone) and for the whole shop. Both limits live in private.config:
--      update private.config set value = '5' where key = 'max_pending_per_contact_per_hour';
--      update private.config set value = '50' where key = 'max_pending_per_hour';
--    Raising here aborts place_order(), which rolls back the stock it reserved.

insert into private.config (key, value) values
  ('max_pending_per_contact_per_hour', '3'),
  ('max_pending_per_hour', '30')
on conflict (key) do nothing;

create index if not exists orders_store_status_created_idx on public.orders (store_id, status, created_at desc);

create function private.limit_pending_orders() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_per_contact int := coalesce((select value::int from private.config where key = 'max_pending_per_contact_per_hour'), 3);
  v_per_hour int := coalesce((select value::int from private.config where key = 'max_pending_per_hour'), 30);
  v_since timestamptz := now() - interval '1 hour';
begin
  if (
    select count(*) from public.orders o
    where o.store_id = new.store_id and o.status = 'pending' and o.created_at >= v_since
      and (lower(o.contact ->> 'email') = lower(new.contact ->> 'email') or o.contact ->> 'phone' = new.contact ->> 'phone')
  ) >= v_per_contact then
    raise exception 'TOO_MANY_ORDERS' using errcode = 'P0001';
  end if;

  if (
    select count(*) from public.orders o
    where o.store_id = new.store_id and o.status = 'pending' and o.created_at >= v_since
  ) >= v_per_hour then
    raise exception 'SHOP_BUSY' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function private.limit_pending_orders() from public, anon, authenticated;

create trigger orders_limit_pending before insert on public.orders
  for each row execute function private.limit_pending_orders();

-- 2. Visitors could read stores.next_order_no (how many orders the shop has had) and
--    created_by (the owner's user id). Only the columns the shop shows stay readable.
revoke select on public.stores from anon, authenticated;
grant select (id, slug, name, tagline, status, currency, theme, branding, created_at, updated_at)
  on public.stores to anon, authenticated;
-- The seller's Settings page reads the auto-cancel days (RLS still limits rows to members).
grant select (pending_order_ttl_days) on public.stores to authenticated;
