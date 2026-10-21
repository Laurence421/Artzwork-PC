-- Public bucket for logos, banners, favicons, product images and payment QR codes.
-- Object paths start with the store id: {store_id}/products/{uuid}.webp

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-assets', 'store-assets', true, 5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/x-icon']
)
on conflict (id) do nothing;

create function private.can_manage_store_path(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_store_id uuid;
begin
  begin
    v_store_id := split_part(p_name, '/', 1)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return public.is_store_member(v_store_id);
end;
$$;

grant usage on schema private to authenticated;
revoke execute on function private.can_manage_store_path(text) from public, anon;
grant execute on function private.can_manage_store_path(text) to authenticated;

create policy "store-assets: members insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'store-assets' and private.can_manage_store_path(name));

create policy "store-assets: members update" on storage.objects
  for update to authenticated
  using (bucket_id = 'store-assets' and private.can_manage_store_path(name))
  with check (bucket_id = 'store-assets' and private.can_manage_store_path(name));

create policy "store-assets: members delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'store-assets' and private.can_manage_store_path(name));
