-- Hourly: cancel unpaid orders past each store's pending_order_ttl_days.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'cancel-stale-pending-orders',
  '15 * * * *',
  $$select private.cancel_stale_pending_orders()$$
);
