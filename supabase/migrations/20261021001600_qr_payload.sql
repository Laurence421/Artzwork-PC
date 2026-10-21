-- The text inside the seller's GCash / bank QR (QR Ph), read from the uploaded image in Settings.
-- With it, each order page shows a QR with the order's exact amount already filled in.
alter table public.payment_methods
  add column qr_payload text check (char_length(qr_payload) <= 512 and qr_payload like '000201%');

-- Orders keep a copy with the method (place_order snapshots the method without it).
create or replace function private.snapshot_payment_online() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_method public.payment_methods;
begin
  select * into v_method from public.payment_methods where id = (new.payment_method->>'id')::uuid;
  new.payment_method := new.payment_method
    || jsonb_build_object('online', coalesce(v_method.online, false))
    || case when v_method.qr_payload is not null then jsonb_build_object('qr_payload', v_method.qr_payload) else '{}'::jsonb end;
  return new;
end;
$$;
revoke execute on function private.snapshot_payment_online() from public, anon, authenticated;
