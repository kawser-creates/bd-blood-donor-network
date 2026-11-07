-- Step 1.2: core tables, indexes, triggers
set search_path = public, extensions;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ───────── profiles ─────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (char_length(full_name) between 2 and 100),
  avatar_url text,
  phone text unique,
  email text,
  date_of_birth date check (date_of_birth is null or date_of_birth < current_date),
  gender public.gender_type,
  blood_group public.blood_group,
  division_id int references public.divisions(id),
  district_id int references public.districts(id),
  upazila_id int references public.upazilas(id),
  union_id int references public.unions(id),
  area_text text check (char_length(area_text) <= 200),
  location geography(Point,4326),
  emergency_contact_name text check (char_length(emergency_contact_name) <= 100),
  emergency_contact_phone text check (char_length(emergency_contact_phone) <= 20),
  language text not null default 'bn' check (language in ('bn','en')),
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index profiles_location_gix on public.profiles using gist (location);
create index profiles_district_idx on public.profiles(district_id, upazila_id);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ───────── donor_profiles ─────────
create table public.donor_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  blood_group public.blood_group,          -- synced from profiles
  location geography(Point,4326),          -- synced from profiles
  district_id int references public.districts(id),
  upazila_id int references public.upazilas(id),
  availability public.availability_status not null default 'available',
  last_donation_date date check (last_donation_date is null or last_donation_date <= current_date),
  total_donations int not null default 0 check (total_donations >= 0),
  is_verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id),
  share_phone_on_accept boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index donor_location_gix on public.donor_profiles using gist (location);
create index donor_match_idx on public.donor_profiles(blood_group, availability);
create index donor_available_idx on public.donor_profiles(blood_group) where availability = 'available';
create index donor_area_idx on public.donor_profiles(district_id, upazila_id, blood_group);
create trigger donor_profiles_updated before update on public.donor_profiles
  for each row execute function public.set_updated_at();

-- ───────── hospitals / blood_banks ─────────
create table public.hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 200),
  address text,
  phone text,
  division_id int references public.divisions(id),
  district_id int references public.districts(id),
  upazila_id int references public.upazilas(id),
  location geography(Point,4326),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hospitals_location_gix on public.hospitals using gist (location);
create index hospitals_name_trgm on public.hospitals using gin (name gin_trgm_ops);
create index hospitals_district_idx on public.hospitals(district_id);
create trigger hospitals_updated before update on public.hospitals
  for each row execute function public.set_updated_at();

create table public.blood_banks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 200),
  hospital_id uuid references public.hospitals(id) on delete set null,
  address text,
  phone text,
  email text,
  operating_hours text,
  notes text,
  division_id int references public.divisions(id),
  district_id int references public.districts(id),
  upazila_id int references public.upazilas(id),
  location geography(Point,4326),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index blood_banks_location_gix on public.blood_banks using gist (location);
create index blood_banks_district_idx on public.blood_banks(district_id);
create trigger blood_banks_updated before update on public.blood_banks
  for each row execute function public.set_updated_at();

-- ───────── blood_requests ─────────
create table public.blood_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  patient_name text check (char_length(patient_name) <= 100),
  blood_group public.blood_group not null,
  bags_needed int not null check (bags_needed between 1 and 20),
  hospital_id uuid references public.hospitals(id) on delete set null,
  hospital_name text not null check (char_length(hospital_name) between 2 and 200),
  hospital_address text not null check (char_length(hospital_address) <= 300),
  division_id int references public.divisions(id),
  district_id int not null references public.districts(id),
  upazila_id int references public.upazilas(id),
  location geography(Point,4326),
  required_at timestamptz not null,
  contact_phone text not null check (char_length(contact_phone) between 6 and 20),
  description text check (char_length(description) <= 1000),
  priority public.request_priority not null default 'urgent',
  status public.request_status not null default 'pending',
  radius_km int not null default 10 check (radius_km between 1 and 200),
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index requests_location_gix on public.blood_requests using gist (location);
create index requests_status_idx on public.blood_requests(status, blood_group, created_at desc);
create index requests_requester_idx on public.blood_requests(requester_id, created_at desc);
create index requests_district_idx on public.blood_requests(district_id, created_at desc);
create index requests_expiry_idx on public.blood_requests(expires_at)
  where status in ('pending','notification_sent','donor_responded','donor_confirmed');
create trigger blood_requests_updated before update on public.blood_requests
  for each row execute function public.set_updated_at();

-- ───────── donor_responses ─────────
create table public.donor_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.blood_requests(id) on delete cascade,
  donor_id uuid not null references public.profiles(id) on delete cascade,
  status public.response_status not null default 'pending',
  message text check (char_length(message) <= 500),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, donor_id)
);
create index responses_donor_idx on public.donor_responses(donor_id, created_at desc);
create index responses_request_idx on public.donor_responses(request_id, status);
create trigger donor_responses_updated before update on public.donor_responses
  for each row execute function public.set_updated_at();

-- ───────── notifications (also the send queue) ─────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid references public.blood_requests(id) on delete cascade,
  type text not null check (type in ('blood_request','donor_accepted','donor_rejected','request_update','request_completed','request_expired','system')),
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  status public.notification_status not null default 'queued',
  attempts int not null default 0,
  last_error text,
  next_retry_at timestamptz,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
-- duplicate-notification prevention per request
create unique index notifications_dedupe_uidx on public.notifications(user_id, request_id, type)
  where request_id is not null;
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create index notifications_queue_idx on public.notifications(next_retry_at)
  where status in ('queued','failed');

create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  blood_group_alert boolean not null default true,
  location_alert boolean not null default true,
  emergency_alert boolean not null default true,
  max_alerts_per_day int not null default 5 check (max_alerts_per_day between 1 and 50),
  alert_radius_km int not null default 25 check (alert_radius_km between 1 and 200),
  updated_at timestamptz not null default now()
);
create trigger notification_preferences_updated before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create table public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  fcm_token text not null unique,
  platform text not null default 'web' check (platform in ('web','android','ios')),
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index user_devices_user_idx on public.user_devices(user_id) where is_active;

-- ───────── donation_history ─────────
create table public.donation_history (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid references public.blood_requests(id) on delete set null,
  donated_on date not null check (donated_on <= current_date),
  hospital_name text,
  confirmed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index donation_history_donor_idx on public.donation_history(donor_id, donated_on desc);

-- ───────── reports, admin, messages, audit ─────────
create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  request_id uuid references public.blood_requests(id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 100),
  details text check (char_length(details) <= 1000),
  status public.report_status not null default 'open',
  handled_by uuid references public.profiles(id),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  check (reported_user_id is not null or request_id is not null)
);
create index user_reports_status_idx on public.user_reports(status, created_at desc);

create table public.admin_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role public.admin_role_type not null,
  granted_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.blood_requests(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index messages_thread_idx on public.messages(request_id, created_at);
create index messages_recipient_idx on public.messages(recipient_id, read_at);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);
create index audit_logs_actor_idx on public.audit_logs(actor_id, created_at desc);
