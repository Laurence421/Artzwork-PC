-- Single-client mode: the platform runs exactly one store, and only the
-- configured seller email may create it. Everyone else is a customer.
-- Change the seller later with:
--   update private.config set value = 'new@email.com' where key = 'seller_email';

create table private.config (
  key text primary key,
  value text not null
);

revoke all on private.config from public, anon, authenticated;

-- Replace the placeholder with the shop owner's email before applying (or update it afterwards).
insert into private.config (key, value) values ('seller_email', 'owner@example.com');

-- At most one store, ever: a unique index on a constant.
create unique index stores_single_store on public.stores ((true));

-- True for the signed-in seller account (email matches config and is confirmed).
create function public.is_seller() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from auth.users u
    join private.config c on c.key = 'seller_email'
    where u.id = (select auth.uid())
      and lower(u.email) = lower(c.value)
      and u.email_confirmed_at is not null
  );
$$;

revoke execute on function public.is_seller() from public, anon;
grant execute on function public.is_seller() to authenticated;

create or replace function public.create_store(p_name text, p_slug text)
returns public.stores
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_store public.stores;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if not public.is_seller() then
    raise exception 'NOT_SELLER' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.stores) then
    raise exception 'STORE_EXISTS' using errcode = 'P0001';
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
