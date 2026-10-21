-- Customers can delete their own account (Profile -> Delete account).
-- Deleting the auth user also deletes, through foreign keys: saved addresses (cascade) and
-- sessions; customers.user_id and order history links are set to null, so the shop keeps its
-- orders (each order has its own copy of the contact and address, as the law and returns need).
-- The shop owner's account can't be deleted this way, so the shop can't lose its only seller.

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if public.is_seller() or exists (select 1 from public.store_members where user_id = v_uid) then
    raise exception 'OWNER_ACCOUNT' using errcode = 'P0001';
  end if;
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
