-- Functions the app calls through supabase.rpc(). Errors are raised with
-- SQLSTATE P0001 and a stable upper-case message the app maps to user text;
-- `detail` carries the id of the offending row where useful.

-- create_store ---------------------------------------------------------------

create function public.create_store(p_name text, p_slug text)
returns public.stores
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_store public.stores;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.stores where slug = lower(btrim(p_slug))) then
    raise exception 'SLUG_TAKEN' using errcode = 'P0001';
  end if;

  insert into public.stores (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), v_uid)
  returning * into v_store;

  insert into public.store_members (store_id, user_id, role) values (v_store.id, v_uid, 'owner');

  -- Starter content the brief calls out, so a new store is usable right away.
  insert into public.labels (store_id, text, color) values
    (v_store.id, 'New', '#2563eb'),
    (v_store.id, 'Sale', '#dc2626'),
    (v_store.id, 'Best Seller', '#d97706');

  insert into public.payment_methods (store_id, type, label, instructions, position) values
    (v_store.id, 'cod', 'Cash on delivery', 'Pay the courier when your order arrives.', 0);

  insert into public.shipping_options (store_id, name, fee, position) values
    (v_store.id, 'Standard delivery', 0, 0);

  return v_store;
end;
$$;

revoke execute on function public.create_store(text, text) from public, anon;
grant execute on function public.create_store(text, text) to authenticated;

-- place_order ----------------------------------------------------------------
-- p_items:   [{ "product_id": uuid, "quantity": int }, ...]
-- p_contact: { "name", "email", "phone" }
-- p_address: { "recipient", "phone", "line1", "line2", "barangay", "city", "province", "postal_code" }
-- Prices always come from the database; the client sends only ids and quantities.

create function public.place_order(
  p_store_slug text,
  p_items jsonb,
  p_contact jsonb,
  p_address jsonb,
  p_payment_method_id uuid,
  p_shipping_option_id uuid,
  p_notes text default null
)
returns table (order_no int, tracking_token text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_store public.stores;
  v_payment public.payment_methods;
  v_shipping public.shipping_options;
  v_email text;
  v_customer_id uuid;
  v_order_id uuid;
  v_order_no int;
  v_token text;
  v_subtotal int := 0;
  v_item record;
  v_product public.products;
  v_unit_price int;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
begin
  select * into v_store from public.stores where slug = p_store_slug and status = 'active';
  if not found then
    raise exception 'STORE_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Items: non-empty array of at most 50 distinct products, quantities 1..99.
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'CART_EMPTY' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'CART_TOO_LARGE' using errcode = 'P0001';
  end if;

  -- Contact and address.
  if coalesce(btrim(p_contact ->> 'name'), '') = ''
     or coalesce(btrim(p_contact ->> 'phone'), '') = '' then
    raise exception 'CONTACT_INVALID' using errcode = 'P0001';
  end if;

  if v_uid is not null then
    -- Signed-in customers order under their account email, so an order can never
    -- link someone else's customer record (and its history) to this account.
    select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  else
    v_email := lower(btrim(p_contact ->> 'email'));
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'CONTACT_INVALID' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_address) is distinct from 'object'
     or coalesce(btrim(p_address ->> 'line1'), '') = ''
     or coalesce(btrim(p_address ->> 'city'), '') = ''
     or coalesce(btrim(p_address ->> 'province'), '') = '' then
    raise exception 'ADDRESS_INVALID' using errcode = 'P0001';
  end if;

  select * into v_payment from public.payment_methods
  where id = p_payment_method_id and store_id = v_store.id and enabled;
  if not found then
    raise exception 'PAYMENT_METHOD_INVALID' using errcode = 'P0001';
  end if;

  select * into v_shipping from public.shipping_options
  where id = p_shipping_option_id and store_id = v_store.id and enabled;
  if not found then
    raise exception 'SHIPPING_OPTION_INVALID' using errcode = 'P0001';
  end if;

  -- Reserve stock. Rows are locked in product_id order so concurrent orders
  -- cannot deadlock; a failing item aborts the whole transaction.
  for v_item in
    select (e ->> 'product_id')::uuid as product_id, sum((e ->> 'quantity')::int)::int as quantity
    from jsonb_array_elements(p_items) e
    group by 1
    order by 1
  loop
    if v_item.quantity is null or v_item.quantity < 1 or v_item.quantity > 99 then
      raise exception 'QUANTITY_INVALID' using errcode = 'P0001', detail = v_item.product_id::text;
    end if;

    select * into v_product from public.products
    where id = v_item.product_id and store_id = v_store.id
    for update;

    if not found or not v_product.is_visible then
      raise exception 'PRODUCT_UNAVAILABLE' using errcode = 'P0001', detail = v_item.product_id::text;
    end if;
    if v_product.is_sold_out or v_product.stock < v_item.quantity then
      raise exception 'OUT_OF_STOCK' using errcode = 'P0001', detail = v_item.product_id::text;
    end if;

    update public.products set stock = stock - v_item.quantity where id = v_product.id;

    v_unit_price := coalesce(v_product.sale_price, v_product.price);
    v_subtotal := v_subtotal + v_unit_price * v_item.quantity;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'image_path', (select i.path from public.product_images i
                     where i.product_id = v_product.id order by i.position, i.created_at limit 1),
      'unit_price', v_unit_price,
      'quantity', v_item.quantity
    );
  end loop;

  insert into public.customers (store_id, user_id, email, name, phone)
  values (v_store.id, v_uid, v_email, btrim(p_contact ->> 'name'), btrim(p_contact ->> 'phone'))
  on conflict (store_id, email) do update
    set name = excluded.name,
        phone = excluded.phone,
        user_id = coalesce(public.customers.user_id, excluded.user_id)
  returning id into v_customer_id;

  update public.stores set next_order_no = next_order_no + 1
  where id = v_store.id
  returning next_order_no - 1 into v_order_no;

  insert into public.orders (
    store_id, order_no, customer_id, contact, shipping_address, payment_method,
    shipping_option, notes, subtotal, shipping_fee, total
  ) values (
    v_store.id,
    v_order_no,
    v_customer_id,
    jsonb_build_object('name', btrim(p_contact ->> 'name'), 'email', v_email,
                       'phone', btrim(p_contact ->> 'phone')),
    jsonb_strip_nulls(jsonb_build_object(
      'recipient', coalesce(nullif(btrim(p_address ->> 'recipient'), ''), btrim(p_contact ->> 'name')),
      'phone', coalesce(nullif(btrim(p_address ->> 'phone'), ''), btrim(p_contact ->> 'phone')),
      'line1', btrim(p_address ->> 'line1'),
      'line2', nullif(btrim(p_address ->> 'line2'), ''),
      'barangay', nullif(btrim(p_address ->> 'barangay'), ''),
      'city', btrim(p_address ->> 'city'),
      'province', btrim(p_address ->> 'province'),
      'postal_code', nullif(btrim(p_address ->> 'postal_code'), '')
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'id', v_payment.id, 'type', v_payment.type, 'label', v_payment.label,
      'instructions', v_payment.instructions, 'account_name', v_payment.account_name,
      'account_number', v_payment.account_number, 'qr_path', v_payment.qr_path
    )),
    jsonb_build_object('id', v_shipping.id, 'name', v_shipping.name, 'fee', v_shipping.fee),
    nullif(btrim(left(p_notes, 1000)), ''),
    v_subtotal,
    v_shipping.fee,
    v_subtotal + v_shipping.fee
  )
  returning id, orders.tracking_token into v_order_id, v_token;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    insert into public.order_items (
      store_id, order_id, product_id, product_name, image_path, unit_price, quantity, line_total
    ) values (
      v_store.id, v_order_id, (v_line ->> 'product_id')::uuid, v_line ->> 'product_name',
      v_line ->> 'image_path', (v_line ->> 'unit_price')::int, (v_line ->> 'quantity')::int,
      (v_line ->> 'unit_price')::int * (v_line ->> 'quantity')::int
    );
  end loop;

  insert into public.order_status_events (store_id, order_id, status, created_by)
  values (v_store.id, v_order_id, 'pending', v_uid);

  return query select v_order_no, v_token;
end;
$$;

revoke execute on function public.place_order(text, jsonb, jsonb, jsonb, uuid, uuid, text) from public;
grant execute on function public.place_order(text, jsonb, jsonb, jsonb, uuid, uuid, text)
  to anon, authenticated;

-- Order status ---------------------------------------------------------------

-- Internal: applies a transition, restores stock on cancel, records the event.
-- Not exposed through the API (private schema); callers check permissions.
create function private.set_order_status(
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

  update public.orders set status = p_status where id = v_order.id returning * into v_order;

  insert into public.order_status_events (store_id, order_id, status, note, created_by)
  values (v_order.store_id, v_order.id, p_status, nullif(btrim(left(p_note, 500)), ''), p_actor);

  return v_order;
end;
$$;

revoke execute on function private.set_order_status(uuid, public.order_status, text, uuid)
  from public, anon, authenticated;

create function public.update_order_status(
  p_order_id uuid, p_status public.order_status, p_note text default null
) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_store_id uuid;
begin
  select store_id into v_store_id from public.orders where id = p_order_id;
  if v_store_id is null or not public.is_store_member(v_store_id) then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  return private.set_order_status(p_order_id, p_status, p_note, (select auth.uid()));
end;
$$;

revoke execute on function public.update_order_status(uuid, public.order_status, text) from public, anon;
grant execute on function public.update_order_status(uuid, public.order_status, text) to authenticated;

-- Order tracking (guests use the unguessable token from the confirmation link) --

create function public.get_order_by_token(p_token text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'order_no', o.order_no,
    'status', o.status,
    'created_at', o.created_at,
    'store', jsonb_build_object('slug', s.slug, 'name', s.name),
    'contact', o.contact,
    'shipping_address', o.shipping_address,
    'payment_method', o.payment_method,
    'shipping_option', o.shipping_option,
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

-- Customer accounts ----------------------------------------------------------

-- Links guest customer records to the signed-in account once its email is verified.
create function public.claim_customer_records()
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_count int;
begin
  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_uid and u.email_confirmed_at is not null;

  if v_email is null then
    return 0;
  end if;

  update public.customers set user_id = v_uid
  where email = v_email and user_id is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.claim_customer_records() from public, anon;
grant execute on function public.claim_customer_records() to authenticated;

-- Dashboard home -------------------------------------------------------------

-- Sales count orders that are paid, shipped or completed; order counts exclude cancelled.
create function public.store_sales_summary(p_store_id uuid, p_tz text default 'Asia/Manila')
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone p_tz)::date;
  v_month_start date := date_trunc('month', now() at time zone p_tz)::date;
  v_result jsonb;
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'STORE_NOT_FOUND' using errcode = 'P0001';
  end if;

  with o as (
    select (created_at at time zone p_tz)::date as day, status, total
    from public.orders
    where store_id = p_store_id
      and created_at >= ((least(v_month_start, v_today - 29))::timestamp at time zone p_tz)
  )
  select jsonb_build_object(
    'today_sales', coalesce(sum(total) filter (
      where day = v_today and status in ('paid', 'shipped', 'completed')), 0),
    'today_orders', count(*) filter (where day = v_today and status <> 'cancelled'),
    'month_sales', coalesce(sum(total) filter (
      where day >= v_month_start and status in ('paid', 'shipped', 'completed')), 0),
    'month_orders', count(*) filter (where day >= v_month_start and status <> 'cancelled'),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'sales', coalesce((select sum(o2.total) from o o2
                           where o2.day = d.day and o2.status in ('paid', 'shipped', 'completed')), 0),
        'orders', (select count(*) from o o2 where o2.day = d.day and o2.status <> 'cancelled')
      ) order by d.day)
      from (select generate_series(v_today - 29, v_today, interval '1 day')::date as day) d
    )
  ) into v_result
  from o;

  return v_result || jsonb_build_object(
    'pending_orders', (select count(*) from public.orders
                       where store_id = p_store_id and status = 'pending'),
    'low_stock', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'stock', p.stock, 'threshold', p.low_stock_threshold
      ) order by p.stock, p.name), '[]'::jsonb)
      from (
        select * from public.products
        where store_id = p_store_id and not is_sold_out and stock <= low_stock_threshold
        order by stock, name
        limit 10
      ) p
    )
  );
end;
$$;

revoke execute on function public.store_sales_summary(uuid, text) from public, anon;
grant execute on function public.store_sales_summary(uuid, text) to authenticated;

-- Housekeeping ---------------------------------------------------------------

-- Cancels unpaid orders older than each store's pending_order_ttl_days and
-- returns their stock. Scheduled by the cron migration.
create function private.cancel_stale_pending_orders()
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_order_id uuid;
  v_count int := 0;
begin
  for v_order_id in
    select o.id
    from public.orders o
    join public.stores s on s.id = o.store_id
    where o.status = 'pending'
      and o.created_at < now() - make_interval(days => s.pending_order_ttl_days)
  loop
    perform private.set_order_status(v_order_id, 'cancelled', 'Cancelled automatically: not paid in time', null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function private.cancel_stale_pending_orders() from public, anon, authenticated;

-- Helper functions are callable by the API roles; internal ones are not.
revoke execute on function public.is_order_customer(uuid) from public, anon;
grant execute on function public.is_order_customer(uuid) to authenticated;
