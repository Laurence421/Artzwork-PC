-- Fix: only orders that were given unique centavos (pay_amount > total) can be matched from an SMS.
-- Orders without them (older orders, or when no free centavo was left) share their plain total with
-- other orders, so an SMS for that amount must never mark one of them paid; the seller checks those.

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
    where store_id = v_store_id and status = 'pending' and pay_amount = p_amount and pay_amount > total;
    if v_count = 1 then
      select * into v_order from public.orders
      where store_id = v_store_id and status = 'pending' and pay_amount = p_amount and pay_amount > total
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
