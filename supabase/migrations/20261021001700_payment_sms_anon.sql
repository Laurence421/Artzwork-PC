-- Visitors (anon) never need the payment SMS log; row security already hid every row, now the
-- table itself is closed to them too. Signed-in store members still read it (RLS policy).
revoke all on public.payment_sms from anon;
