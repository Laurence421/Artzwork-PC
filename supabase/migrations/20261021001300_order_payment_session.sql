-- The order page needs the online payment's session to check it with the provider when the
-- customer comes back (a session id is useless without the shop's provider key).

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
    'payment_session_id', o.payment_session_id,
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
