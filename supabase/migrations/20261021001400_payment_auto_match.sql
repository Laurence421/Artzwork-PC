-- Free automatic payment check for manual GCash / bank payments (no gateway fees).
-- 1. Each manual GCash / bank order gets a unique amount to pay: its total plus 1-99 centavos that
--    no other unpaid order is using (pay_amount), e.g. P18,360.37.
-- 2. The shop's phone forwards its "You have received PHP 18,360.37 ..." SMS to the server, which
--    calls match_payment_sms(): if exactly one unpaid order waits for that amount, it is marked paid.
--    Every SMS is logged (payment_sms) so the seller can see what was matched.
-- Only this server can call match_payment_sms (the same payment_confirm_secret as online payments).

alter table public.orders add column pay_amount int check (pay_amount >= 0);
update public.orders set pay_amount = total where pay_amount is null;
alter table public.orders alter column pay_amount set not null;

-- At most one unpaid order per unique amount (orders without extra centavos aren't auto-matched).
create unique index orders_pending_pay_amount_idx on public.orders (store_id, pay_amount)
  where status = 'pending' and pay_amount <> total;

create function private.assign_pay_amount() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_cents int;
begin
  new.pay_amount := new.total;
  if new.payment_method->>'type' = 'cod' or coalesce((new.payment_method->>'online')::boolean, false) then
    return new;
  end if;
  -- A random free centavo amount, so totals are hard to guess and spread out.
  select c into v_cents
  from generate_series(1, 99) c
  where not exists (
    select 1 from public.orders o
    where o.store_id = new.store_id and o.status = 'pending' and o.pay_amount = new.total + c
  )
  order by random()
  limit 1;
  if v_cents is not null then
    new.pay_amount := new.total + v_cents;
  end if;
  return new;
end;
$$;
revoke execute on function private.assign_pay_amount() from public, anon, authenticated;
-- Runs after the payment snapshot trigger (triggers fire in name order).
create trigger orders_xpay_amount before insert on public.orders
  for each row execute function private.assign_pay_amount();

create table public.payment_sms (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  received_at timestamptz not null default now(),
  sender text check (char_length(sender) <= 60),
  body text not null check (char_length(body) <= 600),
  amount int,
  ref text check (char_length(ref) <= 40),
  order_id uuid references public.orders (id) on delete set null,
  result text not null check (result in ('matched', 'already_paid', 'no_match', 'ambiguous', 'not_payment'))
);
create index payment_sms_store_idx on public.payment_sms (store_id, received_at desc);
alter table public.payment_sms enable row level security;
create policy "payment_sms: members read" on public.payment_sms
  for select to authenticated using (public.is_store_member(store_id));
revoke insert, update, delete on public.payment_sms from anon, authenticated;

-- A forwarded SMS, already read by the server (amount in centavos, reference if any).
-- p_dry_run: only say what would happen (the seller's "Try a sample SMS"); nothing is changed or logged.
create or replace function public.match_payment_sms(
  p_secret text, p_amount int, p_ref text, p_sender text, p_body text, p_dry_run boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_store_id uuid := (select id from public.stores limit 1);
  v_order public.orders;
  v_count int;
  v_result text;
  v_ref text := upper(left(nullif(btrim(p_ref), ''), 40));
begin
  perform private.check_payment_secret(p_secret);

  if p_amount is null or p_amount <= 0 then
    v_result := 'not_payment';
  else
    select count(*) into v_count from public.orders
    where store_id = v_store_id and status = 'pending' and pay_amount = p_amount;
    if v_count = 1 then
      select * into v_order from public.orders
      where store_id = v_store_id and status = 'pending' and pay_amount = p_amount
      for update;
      v_result := 'matched';
    elsif v_count > 1 then
      v_result := 'ambiguous';
    else
      -- Paid already (e.g. the same SMS forwarded twice)?
      select * into v_order from public.orders
      where store_id = v_store_id and status = 'paid' and pay_amount = p_amount and pay_amount <> total
        and status_changed_at > now() - interval '1 day'
      order by status_changed_at desc limit 1;
      v_result := case when found then 'already_paid' else 'no_match' end;
    end if;
  end if;

  if not p_dry_run then
    insert into public.payment_sms (store_id, sender, body, amount, ref, order_id, result)
    values (v_store_id, left(p_sender, 60), left(coalesce(p_body, ''), 600), p_amount, v_ref, v_order.id, v_result);

    if v_result = 'matched' then
      update public.orders
      set payment_ref = coalesce(v_ref, payment_ref), payment_ref_at = coalesce(payment_ref_at, now())
      where id = v_order.id;
      perform private.set_order_status(
        v_order.id, 'paid',
        'Paid: matched automatically from the payment SMS' || coalesce(' (ref ' || v_ref || ')', ''),
        null
      );
    end if;
  end if;

  return jsonb_build_object(
    'result', v_result,
    'order_no', v_order.order_no,
    'tracking_token', case when v_result = 'matched' then v_order.tracking_token end
  );
end;
$$;
revoke execute on function public.match_payment_sms(text, int, text, text, text, boolean) from public;
grant execute on function public.match_payment_sms(text, int, text, text, text, boolean) to anon, authenticated;

-- Tracking page: everything as before, plus the exact amount to pay.
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
    'pay_amount', o.pay_amount,
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
