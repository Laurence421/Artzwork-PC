-- Customers who pay by GCash or bank transfer (outside the site) send the transaction's reference
-- number from their order page, so the seller can match the payment before marking it paid.
-- Whoever has the order's tracking link can send it, like they can view the order.
-- No receipt upload: the storage bucket is public, and receipts show names and account numbers.

alter table public.orders
  add column payment_ref text check (char_length(payment_ref) between 4 and 40),
  add column payment_ref_at timestamptz;

create or replace function public.submit_payment_ref(p_token text, p_ref text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_ref text := upper(regexp_replace(btrim(coalesce(p_ref, '')), '\s+', ' ', 'g'));
begin
  select * into v_order from public.orders
  where tracking_token = p_token and length(p_token) = 64
  for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_order.status <> 'pending' or v_order.payment_method->>'type' = 'cod' then
    raise exception 'PAYMENT_REF_NOT_NEEDED' using errcode = 'P0001';
  end if;
  if v_ref !~ '^[A-Z0-9][A-Z0-9 -]{2,38}[A-Z0-9]$' then
    raise exception 'PAYMENT_REF_INVALID' using errcode = 'P0001';
  end if;
  update public.orders set payment_ref = v_ref, payment_ref_at = now() where id = v_order.id;
end;
$$;

revoke execute on function public.submit_payment_ref(text, text) from public;
grant execute on function public.submit_payment_ref(text, text) to anon, authenticated;

-- Tracking page: everything as before, plus the reference the customer sent.
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
    'payment_ref', o.payment_ref,
    'payment_ref_at', o.payment_ref_at,
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
