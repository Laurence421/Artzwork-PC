-- Online payments (like Lazada / Shopee): a GCash or bank method can be "online". The customer is
-- sent to the payment provider's page (PayMongo: GCash, online banking) and the order becomes paid
-- by itself when the provider confirms, with no seller step.
--
-- Only the shop's server can attach a payment session or confirm a payment: both functions need
-- the secret in private.config 'payment_confirm_secret' (also in the server's PAYMENT_CONFIRM_SECRET).
-- Set it once, with a long random value:
--   insert into private.config (key, value) values ('payment_confirm_secret', '<random>')
--     on conflict (key) do update set value = excluded.value;

alter table public.payment_methods add column online boolean not null default false;
alter table public.payment_methods
  add constraint payment_methods_online_not_cod check (not (online and type = 'cod'));

alter table public.orders add column payment_session_id text check (char_length(payment_session_id) <= 100);
create unique index orders_payment_session_idx on public.orders (payment_session_id) where payment_session_id is not null;

-- place_order snapshots the method without "online"; add it without touching place_order.
create function private.snapshot_payment_online() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.payment_method := new.payment_method || jsonb_build_object('online', coalesce(
    (select online from public.payment_methods where id = (new.payment_method->>'id')::uuid), false));
  return new;
end;
$$;
revoke execute on function private.snapshot_payment_online() from public, anon, authenticated;
create trigger orders_snapshot_payment_online before insert on public.orders
  for each row execute function private.snapshot_payment_online();

create function private.check_payment_secret(p_secret text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_secret text := (select value from private.config where key = 'payment_confirm_secret');
begin
  if v_secret is null or length(v_secret) < 32 or p_secret is distinct from v_secret then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function private.check_payment_secret(text) from public, anon, authenticated;

-- The server started a payment for this order at the provider: remember the session, so the
-- provider's confirmation can be matched to it. Returns what the provider's page needs.
create or replace function public.attach_payment_session(p_secret text, p_token text, p_session_id text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
begin
  perform private.check_payment_secret(p_secret);
  select * into v_order from public.orders where tracking_token = p_token and length(p_token) = 64 for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_order.status <> 'pending' or not coalesce((v_order.payment_method->>'online')::boolean, false) then
    raise exception 'PAYMENT_NOT_NEEDED' using errcode = 'P0001';
  end if;
  update public.orders set payment_session_id = left(p_session_id, 100) where id = v_order.id;
  return jsonb_build_object('order_no', v_order.order_no, 'total', v_order.total);
end;
$$;
revoke execute on function public.attach_payment_session(text, text, text) from public;
grant execute on function public.attach_payment_session(text, text, text) to anon, authenticated;

-- The provider confirmed a payment for a session: mark the order paid (once). The amount must be
-- the order's total. Returns the order's tracking token. Paying twice, or after the shop already
-- marked it paid, changes nothing.
create or replace function public.confirm_online_payment(p_secret text, p_session_id text, p_amount int, p_ref text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
begin
  perform private.check_payment_secret(p_secret);
  select * into v_order from public.orders where payment_session_id = p_session_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_amount is distinct from v_order.total then
    raise exception 'AMOUNT_MISMATCH' using errcode = 'P0001';
  end if;
  if v_order.status = 'pending' then
    update public.orders
    set payment_ref = upper(left(nullif(btrim(p_ref), ''), 40)), payment_ref_at = now()
    where id = v_order.id;
    perform private.set_order_status(
      v_order.id, 'paid',
      'Paid online with ' || (v_order.payment_method->>'label') || coalesce(' (ref ' || nullif(btrim(p_ref), '') || ')', ''),
      null
    );
  end if;
  return v_order.tracking_token;
end;
$$;
revoke execute on function public.confirm_online_payment(text, text, int, text) from public;
grant execute on function public.confirm_online_payment(text, text, int, text) to anon, authenticated;

-- Customers send a reference only for manual transfers; online payments confirm themselves.
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
  if v_order.status <> 'pending' or v_order.payment_method->>'type' = 'cod'
     or coalesce((v_order.payment_method->>'online')::boolean, false) then
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
