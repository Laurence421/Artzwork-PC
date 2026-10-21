-- ArtzworkPC core schema. See docs/adr/ADR-001-platform-architecture.md.
-- Money is stored as integer centavos. Every tenant table carries store_id,
-- and child tables use composite (store_id, id) foreign keys so a row can
-- never point at another store's data.

create schema if not exists private;

create type public.store_status as enum ('pending', 'active', 'suspended');
create type public.member_role as enum ('owner', 'staff');
create type public.order_status as enum ('pending', 'paid', 'shipped', 'completed', 'cancelled');
create type public.payment_method_type as enum ('cod', 'gcash', 'bank_transfer');

create function private.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Stores ---------------------------------------------------------------------

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$')
    check (slug <> all (array[
      'admin', 'api', 'app', 'auth', 'dashboard', 'login', 'logout', 'signup',
      'onboarding', 'store', 'stores', 'account', 'settings', 'help', 'support',
      'www', 'static', 'assets', 'artzwork', 'artzworkpc'
    ])),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  tagline text check (char_length(tagline) <= 160),
  status public.store_status not null default 'active',
  currency char(3) not null default 'PHP',
  -- { "primary": "#hex", "accent": "#hex", "background": "#hex", "font": "inter" }
  theme jsonb not null default '{}'::jsonb check (jsonb_typeof(theme) = 'object'),
  -- { logo_path, favicon_path, banner_path, about, announcement, contact{}, socials{}, footer_links[] }
  branding jsonb not null default '{}'::jsonb check (jsonb_typeof(branding) = 'object'),
  pending_order_ttl_days int not null default 3 check (pending_order_ttl_days between 1 and 30),
  next_order_no int not null default 1001,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger stores_updated_at before update on public.stores
  for each row execute function private.set_updated_at();

create table public.store_members (
  store_id uuid not null references public.stores (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create index store_members_user_idx on public.store_members (user_id);

-- Catalog ----------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, slug)
);

create index categories_store_position_idx on public.categories (store_id, position);

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 24),
  color text not null default '#111827' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  unique (store_id, id)
);

create index labels_store_idx on public.labels (store_id);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  category_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '' check (char_length(description) <= 10000),
  price int not null check (price >= 0),
  sale_price int check (sale_price >= 0 and sale_price < price),
  stock int not null default 0 check (stock >= 0),
  low_stock_threshold int not null default 5 check (low_stock_threshold >= 0),
  is_visible boolean not null default true,
  is_sold_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, slug),
  foreign key (store_id, category_id)
    references public.categories (store_id, id) on delete set null (category_id)
);

create index products_store_listing_idx on public.products (store_id, is_visible, category_id, created_at desc);
create index products_store_price_idx on public.products (store_id, price);

create trigger products_updated_at before update on public.products
  for each row execute function private.set_updated_at();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  path text not null check (path like store_id::text || '/%'),
  alt text not null default '' check (char_length(alt) <= 200),
  position int not null default 0,
  created_at timestamptz not null default now(),
  foreign key (store_id, product_id) references public.products (store_id, id) on delete cascade
);

create index product_images_product_idx on public.product_images (product_id, position);

create table public.product_labels (
  store_id uuid not null,
  product_id uuid not null,
  label_id uuid not null,
  primary key (product_id, label_id),
  foreign key (store_id, product_id) references public.products (store_id, id) on delete cascade,
  foreign key (store_id, label_id) references public.labels (store_id, id) on delete cascade
);

create index product_labels_label_idx on public.product_labels (label_id);

-- Store settings ---------------------------------------------------------------

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  type public.payment_method_type not null,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  instructions text not null default '' check (char_length(instructions) <= 2000),
  account_name text check (char_length(account_name) <= 100),
  account_number text check (char_length(account_number) <= 60),
  qr_path text check (qr_path like store_id::text || '/%'),
  enabled boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index payment_methods_store_idx on public.payment_methods (store_id, position);

create table public.shipping_options (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text not null default '' check (char_length(description) <= 300),
  fee int not null default 0 check (fee >= 0),
  enabled boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index shipping_options_store_idx on public.shipping_options (store_id, position);

-- Customers --------------------------------------------------------------------

-- One row per (store, email). user_id is set only when the order was placed
-- while signed in with that same email, or claimed later by a verified account.
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  phone text not null check (char_length(phone) between 7 and 20),
  created_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, email)
);

create index customers_user_idx on public.customers (user_id);

-- Saved addresses belong to the account and can be reused at any store.
create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null default 'Home' check (char_length(label) <= 40),
  recipient text not null check (char_length(btrim(recipient)) between 1 and 100),
  phone text not null check (char_length(phone) between 7 and 20),
  line1 text not null check (char_length(btrim(line1)) between 1 and 200),
  line2 text check (char_length(line2) <= 200),
  barangay text check (char_length(barangay) <= 100),
  city text not null check (char_length(btrim(city)) between 1 and 100),
  province text not null check (char_length(btrim(province)) between 1 and 100),
  postal_code text check (char_length(postal_code) <= 10),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index customer_addresses_user_idx on public.customer_addresses (user_id);

-- Orders -----------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  order_no int not null,
  tracking_token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  customer_id uuid not null,
  -- Snapshots taken when the order is placed; never updated afterwards.
  contact jsonb not null,
  shipping_address jsonb not null,
  payment_method jsonb not null,
  shipping_option jsonb not null,
  notes text check (char_length(notes) <= 1000),
  subtotal int not null check (subtotal >= 0),
  shipping_fee int not null check (shipping_fee >= 0),
  total int not null check (total = subtotal + shipping_fee),
  status public.order_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, order_no),
  foreign key (store_id, customer_id) references public.customers (store_id, id)
);

create index orders_store_created_idx on public.orders (store_id, created_at desc);
create index orders_store_status_idx on public.orders (store_id, status);
create index orders_customer_idx on public.orders (customer_id);

create trigger orders_updated_at before update on public.orders
  for each row execute function private.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  image_path text,
  unit_price int not null check (unit_price >= 0),
  quantity int not null check (quantity > 0),
  line_total int not null check (line_total = unit_price * quantity),
  foreign key (store_id, order_id) references public.orders (store_id, id) on delete cascade
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  status public.order_status not null,
  note text check (char_length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (store_id, order_id) references public.orders (store_id, id) on delete cascade
);

create index order_status_events_order_idx on public.order_status_events (order_id, created_at);
