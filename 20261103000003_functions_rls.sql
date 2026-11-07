-- Step 1.3: helper functions, triggers, search functions, RLS
set search_path = public, extensions;

-- ───────── role helpers (security definer → no RLS recursion on admin_roles) ─────────
create or replace function public.has_role(roles public.admin_role_type[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ar.role = any(roles) from public.admin_roles ar where ar.user_id = auth.uid()), false)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(array['super_admin','admin','moderator']::public.admin_role_type[])
$$;

create or replace function public.is_admin_or_above() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(array['super_admin','admin']::public.admin_role_type[])
$$;

-- Cross-table checks used inside RLS policies. SECURITY DEFINER avoids infinite
-- recursion between blood_requests <-> donor_responses policies.
create or replace function public.is_request_owner(p_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blood_requests br
                 where br.id = p_request_id and br.requester_id = auth.uid())
$$;

create or replace function public.has_responded_to(p_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.donor_responses dr
                 where dr.request_id = p_request_id and dr.donor_id = auth.uid())
$$;

-- Informational only. PLACEHOLDER interval (120 days) — must be reviewed by a medical advisor.
create or replace function public.next_possible_donation_date(p_last date) returns date
language sql immutable as $$ select p_last + 120 $$;

-- ───────── new auth user → profile + default notification prefs ─────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, email)
  values (new.id, nullif(new.phone, ''), nullif(new.email, ''))
  on conflict do nothing;
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────── profile guards + sync ─────────
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_staff() then
    if new.is_blocked is distinct from old.is_blocked then
      raise exception 'not allowed to change is_blocked' using errcode = '42501';
    end if;
  end if;
  if new.is_blocked is distinct from old.is_blocked then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), case when new.is_blocked then 'user_blocked' else 'user_unblocked' end,
            'profile', new.id::text, '{}'::jsonb);
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

create or replace function public.sync_donor_from_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.donor_profiles
     set blood_group = new.blood_group, location = new.location,
         district_id = new.district_id, upazila_id = new.upazila_id
   where user_id = new.id;
  return new;
end $$;
create trigger profiles_sync_donor after update of blood_group, location, district_id, upazila_id
  on public.profiles for each row execute function public.sync_donor_from_profile();

create or replace function public.fill_donor_from_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = new.user_id;
  new.blood_group := p.blood_group;
  new.location := p.location;
  new.district_id := p.district_id;
  new.upazila_id := p.upazila_id;
  return new;
end $$;
create trigger donor_profiles_fill before insert on public.donor_profiles
  for each row execute function public.fill_donor_from_profile();

create or replace function public.guard_donor_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin_or_above() then
    if new.is_verified is distinct from old.is_verified
       or new.verified_at is distinct from old.verified_at
       or new.verified_by is distinct from old.verified_by
       or new.total_donations is distinct from old.total_donations
       or new.blood_group is distinct from old.blood_group
       or new.location is distinct from old.location then
      raise exception 'protected donor fields' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger donor_profiles_guard before update on public.donor_profiles
  for each row execute function public.guard_donor_update();

-- ───────── blood request guards ─────────
create or replace function public.before_request_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_recent int;
begin
  if auth.uid() is not null then
    new.requester_id := auth.uid();
    if exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_blocked) then
      raise exception 'account blocked' using errcode = '42501';
    end if;
    select count(*) into v_recent from public.blood_requests r
      where r.requester_id = auth.uid() and r.created_at > now() - interval '24 hours';
    if v_recent >= 5 and not public.is_staff() then
      raise exception 'request limit reached (5 per 24h)' using errcode = '54000';
    end if;
  end if;
  new.status := 'pending';
  new.request_code := 'BD-' || to_char(now(), 'YYMM') || '-' ||
                      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  if new.expires_at is null then
    new.expires_at := greatest(new.required_at, now()) + interval '12 hours';
  end if;
  if new.required_at < now() - interval '1 hour' then
    raise exception 'required_at is in the past' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger blood_requests_before_insert before insert on public.blood_requests
  for each row execute function public.before_request_insert();

create or replace function public.guard_request_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
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
create trigger blood_requests_guard before update on public.blood_requests
  for each row execute function public.guard_request_update();

-- ───────── public (privacy-safe) request feed ─────────
create view public.public_blood_requests as
select id, request_code, blood_group, bags_needed, hospital_name, hospital_address,
       division_id, district_id, upazila_id, required_at, priority, status, description, created_at
from public.blood_requests
where status in ('pending','notification_sent','donor_responded','donor_confirmed')
  and (expires_at is null or expires_at > now());

-- ───────── dashboard stats ─────────
create or replace function public.dashboard_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total_donors', (select count(*) from public.donor_profiles),
    'available_donors', (select count(*) from public.donor_profiles where availability = 'available'),
    'total_requests', (select count(*) from public.blood_requests),
    'successful_donations', (select count(*) from public.donation_history),
    'emergency_requests', (select count(*) from public.blood_requests
        where priority = 'critical' and status in ('pending','notification_sent','donor_responded','donor_confirmed')),
    'by_blood_group', (select coalesce(jsonb_object_agg(s.bg, s.c), '{}'::jsonb)
        from (select blood_group::text as bg, count(*) as c from public.donor_profiles
              where blood_group is not null group by blood_group) s)
  )
$$;

-- ───────── nearby donor finder (client-callable, privacy-preserving) ─────────
create or replace function public.find_nearby_donors(
  p_blood_group public.blood_group,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_km numeric default 10,
  p_district_id int default null,
  p_upazila_id int default null,
  p_only_available boolean default true,
  p_limit int default 20,
  p_offset int default 0
) returns table (
  donor_id uuid, display_name text, blood_group public.blood_group,
  availability public.availability_status, is_verified boolean, total_donations int,
  last_donation_date date, distance_km numeric, district_id int, upazila_id int
)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_point geography;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_blocked) then
    raise exception 'account blocked' using errcode = '42501';
  end if;
  if p_radius_km is null or p_radius_km <= 0 or p_radius_km > 200 then
    raise exception 'radius must be between 0 and 200 km' using errcode = '22023';
  end if;
  p_limit := least(greatest(coalesce(p_limit, 20), 1), 50);
  p_offset := greatest(coalesce(p_offset, 0), 0);

  if p_lat is not null and p_lng is not null then
    if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      raise exception 'invalid coordinates' using errcode = '22023';
    end if;
    v_point := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  elsif p_district_id is null then
    raise exception 'location or district is required' using errcode = '22023';
  end if;

  return query
  select dp.user_id,
         split_part(coalesce(pr.full_name, ''), ' ', 1),
         dp.blood_group, dp.availability, dp.is_verified, dp.total_donations, dp.last_donation_date,
         case when v_point is null then null
              else round((st_distance(dp.location, v_point) / 500.0)::numeric) * 0.5 end,
         dp.district_id, dp.upazila_id
  from public.donor_profiles dp
  join public.profiles pr on pr.id = dp.user_id
  where dp.blood_group = p_blood_group
    and pr.is_blocked = false and pr.deleted_at is null
    and dp.user_id <> auth.uid()
    and dp.availability <> 'not_available'
    and (not p_only_available or dp.availability = 'available')
    and (
      (v_point is not null and dp.location is not null
         and st_dwithin(dp.location, v_point, p_radius_km * 1000))
      or
      (v_point is null and dp.district_id = p_district_id
         and (p_upazila_id is null or dp.upazila_id = p_upazila_id))
    )
  order by (dp.availability <> 'available'),
           case when v_point is null then 0 else st_distance(dp.location, v_point) end,
           dp.total_donations desc
  limit p_limit offset p_offset;
end $$;

-- ───────── donors to notify for a request (service role / Edge Function only) ─────────
create or replace function public.find_notifiable_donors(p_request_id uuid, p_limit int default 500)
returns table (user_id uuid, distance_km numeric)
language sql stable set search_path = public, extensions as $$
  select dp.user_id,
         round((st_distance(dp.location, br.location) / 500.0)::numeric) * 0.5
  from public.blood_requests br
  join public.donor_profiles dp on dp.blood_group = br.blood_group and dp.availability = 'available'
  join public.profiles pr on pr.id = dp.user_id and pr.is_blocked = false and pr.deleted_at is null
  join public.notification_preferences np on np.user_id = dp.user_id and np.enabled
  where br.id = p_request_id
    and br.status in ('pending','notification_sent')
    and br.location is not null and dp.location is not null
    and dp.user_id <> br.requester_id
    and np.location_alert
    and ((br.priority = 'critical' and np.emergency_alert)
         or (br.priority <> 'critical' and np.blood_group_alert))
    and st_dwithin(dp.location, br.location, least(br.radius_km, np.alert_radius_km) * 1000)
    and exists (select 1 from public.user_devices ud where ud.user_id = dp.user_id and ud.is_active)
    and not exists (select 1 from public.notifications n
                    where n.user_id = dp.user_id and n.request_id = br.id and n.type = 'blood_request')
    and (select count(*) from public.notifications n2
         where n2.user_id = dp.user_id and n2.type = 'blood_request'
           and n2.created_at > now() - interval '24 hours') < np.max_alerts_per_day
  order by st_distance(dp.location, br.location)
  limit least(greatest(p_limit, 1), 2000)
$$;

-- ───────── contact disclosure: only after a donor accepts ─────────
create or replace function public.get_request_contacts(p_request_id uuid)
returns table (user_id uuid, full_name text, phone text, contact_role text)
language plpgsql stable security definer set search_path = public as $$
declare v_requester uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select br.requester_id into v_requester from public.blood_requests br where br.id = p_request_id;
  if v_requester is null then
    return;
  end if;
  if v_requester = auth.uid() then
    return query
      select pr.id, pr.full_name, pr.phone, 'donor'::text
      from public.donor_responses dr
      join public.profiles pr on pr.id = dr.donor_id
      join public.donor_profiles dp on dp.user_id = dr.donor_id
      where dr.request_id = p_request_id
        and dr.status in ('accepted','confirmed')
        and dp.share_phone_on_accept;
  elsif exists (select 1 from public.donor_responses dr
                where dr.request_id = p_request_id and dr.donor_id = auth.uid()
                  and dr.status in ('accepted','confirmed')) then
    return query
      select pr.id, pr.full_name, br.contact_phone, 'requester'::text
      from public.blood_requests br
      join public.profiles pr on pr.id = br.requester_id
      where br.id = p_request_id;
  end if;
end $$;

-- ───────── function privileges ─────────
revoke all on function public.find_nearby_donors(public.blood_group, double precision, double precision, numeric, int, int, boolean, int, int) from public, anon;
revoke all on function public.get_request_contacts(uuid) from public, anon;
revoke all on function public.dashboard_stats() from public, anon;
revoke all on function public.find_notifiable_donors(uuid, int) from public, anon, authenticated;
grant execute on function public.find_nearby_donors(public.blood_group, double precision, double precision, numeric, int, int, boolean, int, int) to authenticated;
grant execute on function public.get_request_contacts(uuid) to authenticated;
grant execute on function public.dashboard_stats() to authenticated;
grant execute on function public.find_notifiable_donors(uuid, int) to service_role;

-- ───────── table privileges (defence in depth on top of RLS) ─────────
revoke all on all tables in schema public from anon;
grant select on public.divisions, public.districts, public.upazilas, public.unions,
                public.hospitals, public.blood_banks to anon;
grant select on public.public_blood_requests to authenticated;

revoke insert, update, delete on public.donor_responses, public.notifications,
        public.donation_history, public.audit_logs from authenticated;
revoke delete on public.profiles, public.blood_requests, public.admin_roles from authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;

-- ───────── RLS ─────────
alter table public.divisions enable row level security;
alter table public.districts enable row level security;
alter table public.upazilas enable row level security;
alter table public.unions enable row level security;
alter table public.profiles enable row level security;
alter table public.donor_profiles enable row level security;
alter table public.hospitals enable row level security;
alter table public.blood_banks enable row level security;
alter table public.blood_requests enable row level security;
alter table public.donor_responses enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.user_devices enable row level security;
alter table public.donation_history enable row level security;
alter table public.user_reports enable row level security;
alter table public.admin_roles enable row level security;
alter table public.messages enable row level security;
alter table public.audit_logs enable row level security;

-- locations: public read, admin write
create policy divisions_read on public.divisions for select to anon, authenticated using (true);
create policy districts_read on public.districts for select to anon, authenticated using (true);
create policy upazilas_read on public.upazilas for select to anon, authenticated using (true);
create policy unions_read on public.unions for select to anon, authenticated using (true);
create policy divisions_write on public.divisions for all to authenticated
  using (public.has_role(array['super_admin']::public.admin_role_type[]))
  with check (public.has_role(array['super_admin']::public.admin_role_type[]));
create policy districts_write on public.districts for all to authenticated
  using (public.has_role(array['super_admin']::public.admin_role_type[]))
  with check (public.has_role(array['super_admin']::public.admin_role_type[]));
create policy upazilas_write on public.upazilas for all to authenticated
  using (public.has_role(array['super_admin']::public.admin_role_type[]))
  with check (public.has_role(array['super_admin']::public.admin_role_type[]));
create policy unions_write on public.unions for all to authenticated
  using (public.has_role(array['super_admin']::public.admin_role_type[]))
  with check (public.has_role(array['super_admin']::public.admin_role_type[]));

-- profiles
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_select_staff on public.profiles for select to authenticated using (public.is_staff());
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin_or_above()) with check (public.is_admin_or_above());

-- donor_profiles (other users see donors ONLY via find_nearby_donors)
create policy donors_select_own on public.donor_profiles for select to authenticated using (user_id = auth.uid());
create policy donors_select_staff on public.donor_profiles for select to authenticated using (public.is_staff());
create policy donors_insert_own on public.donor_profiles for insert to authenticated with check (user_id = auth.uid());
create policy donors_update_own on public.donor_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy donors_update_admin on public.donor_profiles for update to authenticated
  using (public.is_admin_or_above()) with check (public.is_admin_or_above());
create policy donors_delete_own on public.donor_profiles for delete to authenticated using (user_id = auth.uid());

-- hospitals / blood banks
create policy hospitals_read on public.hospitals for select to anon, authenticated
  using (is_active or public.is_staff());
create policy hospitals_write on public.hospitals for all to authenticated
  using (public.is_admin_or_above()) with check (public.is_admin_or_above());
create policy blood_banks_read on public.blood_banks for select to anon, authenticated
  using (is_active or public.is_staff());
create policy blood_banks_write on public.blood_banks for all to authenticated
  using (public.is_admin_or_above()) with check (public.is_admin_or_above());

-- blood_requests (full rows: owner, staff, or a donor who accepted; everyone else uses public_blood_requests)
create policy requests_select_own on public.blood_requests for select to authenticated
  using (requester_id = auth.uid());
create policy requests_select_staff on public.blood_requests for select to authenticated
  using (public.is_staff());
create policy requests_select_responder on public.blood_requests for select to authenticated
  using (public.has_responded_to(id));
create policy requests_insert_own on public.blood_requests for insert to authenticated
  with check (requester_id = auth.uid());
create policy requests_update_own on public.blood_requests for update to authenticated
  using (requester_id = auth.uid()) with check (requester_id = auth.uid());
create policy requests_update_staff on public.blood_requests for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- donor_responses (writes only via Edge Function / service role)
create policy responses_select_donor on public.donor_responses for select to authenticated
  using (donor_id = auth.uid());
create policy responses_select_requester on public.donor_responses for select to authenticated
  using (public.is_request_owner(request_id));
create policy responses_select_staff on public.donor_responses for select to authenticated
  using (public.is_staff());

-- notifications (insert/update via service role; user may mark own as read)
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_select_staff on public.notifications for select to authenticated
  using (public.is_staff());
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notification_preferences / user_devices
create policy prefs_own on public.notification_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy devices_own on public.user_devices for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- donation_history (written by Edge Function on confirmation)
create policy history_select_own on public.donation_history for select to authenticated
  using (donor_id = auth.uid());
create policy history_select_staff on public.donation_history for select to authenticated
  using (public.is_staff());

-- user_reports
create policy reports_insert_own on public.user_reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy reports_select_own on public.user_reports for select to authenticated
  using (reporter_id = auth.uid());
create policy reports_select_staff on public.user_reports for select to authenticated
  using (public.is_staff());
create policy reports_update_staff on public.user_reports for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- admin_roles
create policy admin_roles_select_own on public.admin_roles for select to authenticated
  using (user_id = auth.uid());
create policy admin_roles_select_super on public.admin_roles for select to authenticated
  using (public.has_role(array['super_admin']::public.admin_role_type[]));
create policy admin_roles_write_super on public.admin_roles for all to authenticated
  using (public.has_role(array['super_admin']::public.admin_role_type[]))
  with check (public.has_role(array['super_admin']::public.admin_role_type[]));

-- messages (only between requester and an accepting donor of the same request)
create policy messages_select_party on public.messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy messages_insert_party on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.blood_requests br
      join public.donor_responses dr on dr.request_id = br.id
      where br.id = messages.request_id
        and dr.status in ('accepted','confirmed')
        and ((br.requester_id = auth.uid() and dr.donor_id = messages.recipient_id)
          or (dr.donor_id = auth.uid() and br.requester_id = messages.recipient_id))
    ));
create policy messages_update_recipient on public.messages for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- audit_logs
create policy audit_select_admin on public.audit_logs for select to authenticated
  using (public.is_admin_or_above());
