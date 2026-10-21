-- The shop has no riders of its own: parcels go out with a courier (J&T, LBC, Lalamove, ...)
-- or the customer picks them up at the shop.
-- 1. Delivery options are either "delivery" or "pickup"; each order keeps the kind in its snapshot.
-- 2. Marking an order shipped can save the courier, tracking number and tracking link,
--    which the customer sees on their order page and in the status email.
-- 3. Unseen updates: each order remembers when its status last changed and when the customer
--    last opened it, so My orders can show how many orders have news.

-- 1. Pickup ---------------------------------------------------------------------------
alter table public.shipping_options
  add column kind text not null default 'delivery' check (kind in ('delivery', 'pickup'));

-- place_order snapshots {id, name, fee}; add the kind without touching place_order.
create function private.snapshot_shipping_kind() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.shipping_option := new.shipping_option || jsonb_build_object('kind', coalesce(
    (select kind from public.shipping_options where id = (new.shipping_option->>'id')::uuid), 'delivery'));
  return new;
end;
$$;
revoke execute on function private.snapshot_shipping_kind() from public, anon, authenticated;
create trigger orders_snapshot_shipping_kind before insert on public.orders
  for each row execute function private.snapshot_shipping_kind();

-- 2. Courier and tracking ---------------------------------------------------------------
alter table public.orders
  add column courier text check (char_length(courier) <= 40),
  add column tracking_no text check (char_length(tracking_no) <= 60),
  add column tracking_url text check (tracking_url ~ '^https://' and char_length(tracking_url) <= 500);

-- 3. Unseen updates ---------------------------------------------------------------------
alter table public.orders
  add column status_changed_at timestamptz not null default now(),
  add column customer_seen_at timestamptz;

-- Orders from before this change: their latest status time, and nothing counts as news yet.
update public.orders o set
  status_changed_at = coalesce((select max(e.created_at) from public.order_status_events e where e.order_id = o.id), o.created_at),
  customer_seen_at = now();

-- set_order_status: same rules as before, and it records when the status changed.
create or replace function private.set_order_status(
  p_order_id uuid, p_status public.order_status, p_note text, p_actor uuid
) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not (
    (v_order.status = 'pending' and p_status in ('paid', 'cancelled')) or
    (v_order.status = 'paid' and p_status in ('shipped', 'cancelled')) or
    (v_order.status = 'shipped' and p_status = 'completed')
  ) then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001',
      detail = v_order.status::text || ' -> ' || p_status::text;
  end if;

  if p_status = 'cancelled' then
    update public.products p
    set stock = p.stock + oi.quantity
    from (
      select product_id, sum(quantity)::int as quantity
      from public.order_items
      where order_id = v_order.id and product_id is not null
      group by product_id
    ) oi
    where p.id = oi.product_id;
  end if;

  update public.orders set status = p_status, status_changed_at = now()
  where id = v_order.id returning * into v_order;

  insert into public.order_status_events (store_id, order_id, status, note, created_by)
  values (v_order.store_id, v_order.id, p_status, nullif(btrim(left(p_note, 500)), ''), p_actor);

  return v_order;
end;
$$;

revoke execute on function private.set_order_status(uuid, public.order_status, text, uuid)
  from public, anon, authenticated;

-- The seller marks an order shipped (or ready for pickup) with its courier details.
create or replace function public.ship_order(
  p_order_id uuid, p_courier text, p_tracking_no text, p_tracking_url text, p_note text default null
) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_store_id uuid;
  v_url text := nullif(btrim(p_tracking_url), '');
begin
  select store_id into v_store_id from public.orders where id = p_order_id;
  if v_store_id is null or not public.is_store_member(v_store_id) then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_url is not null and (v_url !~ '^https://' or char_length(v_url) > 500) then
    raise exception 'TRACKING_URL_INVALID' using errcode = 'P0001';
  end if;
  update public.orders set
    courier = nullif(btrim(left(p_courier, 40)), ''),
    tracking_no = nullif(btrim(left(p_tracking_no, 60)), ''),
    tracking_url = v_url
  where id = p_order_id and status = 'paid';
  return private.set_order_status(p_order_id, 'shipped', p_note, (select auth.uid()));
end;
$$;

revoke execute on function public.ship_order(uuid, text, text, text, text) from public, anon;
grant execute on function public.ship_order(uuid, text, text, text, text) to authenticated;

-- The order page marks the order seen (whoever has its tracking link, like viewing it).
create or replace function public.mark_order_seen(p_token text) returns boolean
language sql security definer set search_path = '' as $$
  with seen as (
    update public.orders set customer_seen_at = now()
    where tracking_token = p_token and length(p_token) = 64
      and (customer_seen_at is null or customer_seen_at < status_changed_at)
    returning 1
  )
  select exists (select 1 from seen);
$$;

revoke execute on function public.mark_order_seen(text) from public;
grant execute on function public.mark_order_seen(text) to anon, authenticated;

-- How many of the signed-in customer's orders changed since they last opened them.
-- Placing an order is not news (they just saw it), so only later changes count.
-- Only orders linked to this customer's account (not the seller's view of every order).
create or replace function public.my_unseen_order_count() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.orders o
  join public.customers c on c.id = o.customer_id
  where c.user_id = (select auth.uid())
    and o.status_changed_at > coalesce(o.customer_seen_at, o.created_at + interval '1 second');
$$;

revoke execute on function public.my_unseen_order_count() from public, anon;
grant execute on function public.my_unseen_order_count() to authenticated;

-- Tracking page and emails: the same order, plus courier details and the pickup address.
create or replace function public.get_order_by_token(p_token text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'order_no', o.order_no,
    'status', o.status,
    'created_at', o.created_at,
    'store', jsonb_build_object('slug', s.slug, 'name', s.name, 'address', s.branding->'contact'->>'address'),
    'contact', o.contact,
    'shipping_address', o.shipping_address,
    'payment_method', o.payment_method,
    'shipping_option', o.shipping_option,
    'courier', o.courier,
    'tracking_no', o.tracking_no,
    'tracking_url', o.tracking_url,
    'notes', o.notes,
    'subtotal', o.subtotal,
    'shipping_fee', o.shipping_fee,
    'total', o.total,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'product_id', i.product_id, 'product_name', i.product_name, 'image_path', i.image_path,
        'unit_price', i.unit_price, 'quantity', i.quantity, 'line_total', i.line_total
      ) order by i.product_name), '[]'::jsonb)
      from public.order_items i where i.order_id = o.id
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'status', e.status, 'note', e.note, 'created_at', e.created_at
      ) order by e.created_at), '[]'::jsonb)
      from public.order_status_events e where e.order_id = o.id
    )
  )
  from public.orders o
  join public.stores s on s.id = o.store_id
  where o.tracking_token = p_token and length(p_token) = 64;
$$;

revoke execute on function public.get_order_by_token(text) from public;
grant execute on function public.get_order_by_token(text) to anon, authenticated;
