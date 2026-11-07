-- Step 3.1: avatar storage + own-location RPCs
set search_path = public, extensions;

-- ───────── avatars bucket (2 MB, images only; users write only inside their own folder) ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────── own location (geography is awkward over PostgREST, so use RPCs) ─────────
-- Rough Bangladesh bounding box; rejects junk coordinates.
create or replace function public.set_my_location(p_lat double precision, p_lng double precision)
returns void
language plpgsql set search_path = public, extensions as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_lat is null or p_lng is null
     or p_lat not between 20.5 and 26.8 or p_lng not between 88.0 and 92.8 then
    raise exception 'location outside Bangladesh' using errcode = '22023';
  end if;
  update public.profiles
     set location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
   where id = auth.uid();
end $$;

create or replace function public.get_my_location()
returns table (lat double precision, lng double precision)
language sql stable set search_path = public, extensions as $$
  select st_y(p.location::geometry), st_x(p.location::geometry)
  from public.profiles p
  where p.id = auth.uid() and p.location is not null
$$;

revoke all on function public.set_my_location(double precision, double precision) from public, anon;
revoke all on function public.get_my_location() from public, anon;
grant execute on function public.set_my_location(double precision, double precision) to authenticated;
grant execute on function public.get_my_location() to authenticated;
