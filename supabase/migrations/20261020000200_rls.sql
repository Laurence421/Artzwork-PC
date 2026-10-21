-- Row Level Security. Sellers reach only stores they are members of; the public
-- reads only active stores and visible products; nobody writes orders directly
-- (see place_order / update_order_status in the functions migration).

create function public.is_store_member(p_store_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.store_members m
    where m.store_id = p_store_id and m.user_id = (select auth.uid())
  );
$$;

create function public.is_store_active(p_store_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.stores s where s.id = p_store_id and s.status = 'active');
$$;

create function public.is_product_public(p_product_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.products p
    join public.stores s on s.id = p.store_id
    where p.id = p_product_id and p.is_visible and s.status = 'active'
  );
$$;

create function public.is_order_customer(p_order_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    join public.customers c on c.id = o.customer_id
    where o.id = p_order_id and c.user_id = (select auth.uid())
  );
$$;

alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.categories enable row level security;
alter table public.labels enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_labels enable row level security;
alter table public.payment_methods enable row level security;
alter table public.shipping_options enable row level security;
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_events enable row level security;

-- Stores: created through create_store(); members may edit only these columns.
create policy "stores: public reads active" on public.stores
  for select to anon, authenticated using (status = 'active');
create policy "stores: members read" on public.stores
  for select to authenticated using (public.is_store_member(id));
create policy "stores: members update" on public.stores
  for update to authenticated
  using (public.is_store_member(id)) with check (public.is_store_member(id));

revoke insert, update, delete on public.stores from anon, authenticated;
grant update (slug, name, tagline, theme, branding, pending_order_ttl_days)
  on public.stores to authenticated;

create policy "store_members: members read" on public.store_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_store_member(store_id));

revoke insert, update, delete on public.store_members from anon, authenticated;

-- Catalog and settings: public reads what the storefront shows, members do everything.
create policy "categories: public read" on public.categories
  for select to anon, authenticated using (public.is_store_active(store_id));
create policy "categories: members manage" on public.categories
  for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy "labels: public read" on public.labels
  for select to anon, authenticated using (public.is_store_active(store_id));
create policy "labels: members manage" on public.labels
  for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy "products: public read" on public.products
  for select to anon, authenticated using (is_visible and public.is_store_active(store_id));
create policy "products: members manage" on public.products
  for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy "product_images: public read" on public.product_images
  for select to anon, authenticated using (public.is_product_public(product_id));
create policy "product_images: members manage" on public.product_images
  for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy "product_labels: public read" on public.product_labels
  for select to anon, authenticated using (public.is_product_public(product_id));
create policy "product_labels: members manage" on public.product_labels
  for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy "payment_methods: public reads enabled" on public.payment_methods
  for select to anon, authenticated using (enabled and public.is_store_active(store_id));
create policy "payment_methods: members manage" on public.payment_methods
  for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy "shipping_options: public reads enabled" on public.shipping_options
  for select to anon, authenticated using (enabled and public.is_store_active(store_id));
create policy "shipping_options: members manage" on public.shipping_options
  for all to authenticated
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

-- Customers and addresses.
create policy "customers: members read" on public.customers
  for select to authenticated using (public.is_store_member(store_id));
create policy "customers: self read" on public.customers
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.customers from anon, authenticated;

create policy "customer_addresses: owner manages" on public.customer_addresses
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.customer_addresses from anon;

-- Orders: read-only through the API; all writes go through security definer functions.
create policy "orders: members read" on public.orders
  for select to authenticated using (public.is_store_member(store_id));
create policy "orders: customer reads own" on public.orders
  for select to authenticated using (public.is_order_customer(id));

create policy "order_items: members read" on public.order_items
  for select to authenticated using (public.is_store_member(store_id));
create policy "order_items: customer reads own" on public.order_items
  for select to authenticated using (public.is_order_customer(order_id));

create policy "order_status_events: members read" on public.order_status_events
  for select to authenticated using (public.is_store_member(store_id));
create policy "order_status_events: customer reads own" on public.order_status_events
  for select to authenticated using (public.is_order_customer(order_id));

revoke insert, update, delete on public.orders, public.order_items, public.order_status_events
  from anon, authenticated;
revoke all on public.orders, public.order_items, public.order_status_events, public.customers
  from anon;
