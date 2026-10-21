-- Indexes for the foreign keys that had none, so deleting a category, an order or an account
-- doesn't scan whole tables (Postgres checks the referencing rows on every delete).
create index if not exists products_category_idx on public.products (category_id) where category_id is not null;
create index if not exists payment_sms_order_idx on public.payment_sms (order_id) where order_id is not null;
create index if not exists order_status_events_created_by_idx on public.order_status_events (created_by) where created_by is not null;
create index if not exists stores_created_by_idx on public.stores (created_by);

-- Fresh statistics for the query planner after the reset.
analyze public.products, public.orders, public.order_items, public.order_status_events, public.customers, public.payment_sms;
