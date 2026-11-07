-- Step 5: email-only sign-in, phone as an UNVERIFIED optional contact field, and safe request RPCs.
-- Additive: no table is dropped, no existing row is deleted. Older migrations are untouched.
set search_path = public, extensions;

-- ───────── 1. phone is a contact detail the user types, never a verified identity ─────────
update public.profiles set phone_verified = false where phone_verified;  -- nothing is "verified" by SMS any more

-- A typed contact number can no longer be forced unique: it is unverified, so uniqueness would let one
-- person block (or probe) another person's number. Auth (email) is what identifies an account.
alter table public.profiles drop constraint if exists profiles_phone_key;
create index if not exists profiles_phone_idx on public.profiles(phone);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, email_verified)
  values (new.id, nullif(new.email, ''), nullif(new.email, '') is not null and new.email_confirmed_at is not null)
  on conflict do nothing;
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- auth.users → profile copy now covers EMAIL only (phone is no longer an Auth identifier here)
create or replace function public.sync_profile_identity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set email          = nullif(new.email, ''),
         email_verified = nullif(new.email, '') is not null and new.email_confirmed_at is not null
   where id = new.id;
  return null;
end $$;

drop trigger if exists on_auth_user_identity_changed on auth.users;
create trigger on_auth_user_identity_changed
  after update of email, email_confirmed_at on auth.users
  for each row
  when (old.email is distinct from new.email or old.email_confirmed_at is distinct from new.email_confirmed_at)
  execute function public.sync_profile_identity();

-- Clients may edit their contact phone (format-checked) but never email / verification flags.
create or replace function public.guard_profile_identity() returns trigger
language plpgsql security definer set search_path = public as $$
declare u auth.users;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select * into u from auth.users where id = new.id;
    new.email          := nullif(u.email, '');
    new.email_verified := nullif(u.email, '') is not null and u.email_confirmed_at is not null;
    new.phone_verified := false;
  elsif new.email is distinct from old.email
     or new.email_verified is distinct from old.email_verified
     or new.phone_verified is distinct from old.phone_verified then
    raise exception 'email and verification status are managed by sign-in' using errcode = '42501';
  end if;

  if new.phone is not null and new.phone !~ '^\+?[0-9]{10,15}$' then
    raise exception 'invalid phone number' using errcode = '22023';
  end if;
  return new;
end $$;

-- ───────── 2. request guard: allow the request RPCs below (and only them) to change status ─────────
-- app.rpc_bypass is a transaction-local setting that only these SECURITY DEFINER functions set.
-- It cannot be set from the API (PostgREST exposes no set_config), so clients cannot use it.
create or replace function public.guard_request_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.rpc_bypass', true) = 'on' then
    return new;
  end if;
  if auth.uid() is not null and not public.is_staff() then
    if new.requester_id is distinct from old.requester_id
       or new.request_code is distinct from old.request_code
       or new.blood_group is distinct from old.blood_group
       or new.bags_needed is distinct from old.bags_needed
       or new.location is distinct from old.location
       or new.district_id is distinct from old.district_id
       or new.radius_km is distinct from old.radius_km
       or new.priority is distinct from old.priority
       or new.expires_at is distinct from old.expires_at then
      raise exception 'protected request fields' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      if new.status <> 'cancelled' or old.status in ('completed','cancelled','expired') then
        raise exception 'only cancellation of an open request is allowed' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;

-- ───────── 3. create a request (runs as the caller, so RLS and the insert triggers apply) ─────────
create or replace function public.create_blood_request(
  p_blood_group public.blood_group, p_bags int, p_hospital_name text, p_hospital_address text,
  p_district_id int, p_upazila_id int, p_required_at timestamptz, p_contact_phone text,
  p_priority public.request_priority, p_description text, p_patient_name text,
  p_lat double precision default null, p_lng double precision default null, p_radius_km int default 10
) returns table (out_id uuid, out_code text)
language plpgsql set search_path = public, extensions as $$
declare v_div int; v_loc geography; r public.blood_requests;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select d.division_id into v_div from public.districts d where d.id = p_district_id;
  if v_div is null then
    raise exception 'invalid district' using errcode = '22023';
  end if;
  if p_upazila_id is not null and not exists
     (select 1 from public.upazilas u where u.id = p_upazila_id and u.district_id = p_district_id) then
    raise exception 'upazila does not belong to the district' using errcode = '22023';
  end if;
  if p_lat is not null and p_lng is not null then
    if p_lat not between 20.5 and 26.8 or p_lng not between 88.0 and 92.8 then
      raise exception 'location outside Bangladesh' using errcode = '22023';
    end if;
    v_loc := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  end if;

  insert into public.blood_requests
    (requester_id, request_code, status, blood_group, bags_needed, hospital_name, hospital_address,
     division_id, district_id, upazila_id, location, required_at, contact_phone, description,
     patient_name, priority, radius_km)
  values
    (auth.uid(), 'pending-code', 'pending', p_blood_group, p_bags, btrim(p_hospital_name), btrim(p_hospital_address),
     v_div, p_district_id, p_upazila_id, v_loc, p_required_at, btrim(p_contact_phone),
     nullif(btrim(coalesce(p_description, '')), ''), nullif(btrim(coalesce(p_patient_name, '')), ''),
     p_priority, least(greatest(coalesce(p_radius_km, 10), 1), 200))
  returning * into r;

  return query select r.id, r.request_code;
end $$;

-- ───────── 4. a donor answers a request ─────────
create or replace function public.respond_to_request(p_request_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare br public.blood_requests; dp public.donor_profiles;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid() and (p.is_blocked or p.deleted_at is not null)) then
    raise exception 'account blocked' using errcode = '42501';
  end if;
  select * into br from public.blood_requests where id = p_request_id;
  if br.id is null
     or br.status not in ('pending','notification_sent','donor_responded','donor_confirmed')
     or (br.expires_at is not null and br.expires_at < now()) then
    raise exception 'request is not open' using errcode = '22023';
  end if;
  if br.requester_id = auth.uid() then
    raise exception 'you cannot respond to your own request' using errcode = '42501';
  end if;
  select * into dp from public.donor_profiles where user_id = auth.uid();
  if dp.user_id is null then
    raise exception 'become a donor first' using errcode = '42501';
  end if;
  if dp.blood_group is distinct from br.blood_group then
    raise exception 'blood group does not match' using errcode = '42501';
  end if;

  insert into public.donor_responses (request_id, donor_id, status, responded_at)
  values (p_request_id, auth.uid(), case when p_accept then 'accepted' else 'rejected' end::public.response_status, now())
  on conflict (request_id, donor_id)
  do update set status = excluded.status, responded_at = now();

  if p_accept and br.status in ('pending','notification_sent') then
    perform set_config('app.rpc_bypass', 'on', true);
    update public.blood_requests set status = 'donor_responded' where id = br.id;
    perform set_config('app.rpc_bypass', 'off', true);
  end if;
end $$;

-- ───────── 5. the requester closes their own request ─────────
create or replace function public.close_request(p_request_id uuid, p_status public.request_status) returns void
language plpgsql security definer set search_path = public as $$
declare br public.blood_requests;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_status not in ('completed','cancelled') then
    raise exception 'status not allowed' using errcode = '22023';
  end if;
  select * into br from public.blood_requests where id = p_request_id and requester_id = auth.uid();
  if br.id is null then
    raise exception 'request not found' using errcode = '42501';
  end if;
  if br.status in ('completed','cancelled','expired') then
    raise exception 'request is already closed' using errcode = '22023';
  end if;
  perform set_config('app.rpc_bypass', 'on', true);
  update public.blood_requests
     set status = p_status, completed_at = case when p_status = 'completed' then now() else completed_at end
   where id = br.id;
  perform set_config('app.rpc_bypass', 'off', true);
end $$;

-- ───────── 6. privileges ─────────
revoke all on function public.create_blood_request(public.blood_group, int, text, text, int, int, timestamptz, text, public.request_priority, text, text, double precision, double precision, int) from public, anon;
revoke all on function public.respond_to_request(uuid, boolean) from public, anon;
revoke all on function public.close_request(uuid, public.request_status) from public, anon;
grant execute on function public.create_blood_request(public.blood_group, int, text, text, int, int, timestamptz, text, public.request_priority, text, text, double precision, double precision, int) to authenticated;
grant execute on function public.respond_to_request(uuid, boolean) to authenticated;
grant execute on function public.close_request(uuid, public.request_status) to authenticated;
