-- Step 4.0: Email + phone sign-in with account linking.
--
-- Supabase Auth (auth.users) is the ONLY source of truth for a user's email / phone and for whether
-- each one is verified. public.profiles keeps a server-maintained COPY (used by SQL functions such as
-- get_request_contacts). Clients may NOT write these columns: otherwise anyone could claim an
-- unverified email/phone, or someone else's number, on their profile.
--
-- One auth user = one profile = at most one donor profile (donor_profiles.user_id is the primary key).
-- Linking an email/phone adds an identifier to the SAME auth user; two accounts are never merged here.
set search_path = public, extensions;

alter table public.profiles
  add column if not exists email_verified boolean not null default false,
  add column if not exists phone_verified boolean not null default false;

-- ───────── backfill from auth.users (existing data stays intact) ─────────
update public.profiles p
   set phone          = coalesce(nullif(u.phone, ''), p.phone),
       phone_verified = (nullif(u.phone, '') is not null and u.phone_confirmed_at is not null),
       email          = coalesce(nullif(u.email, ''), p.email),
       email_verified = (nullif(u.email, '') is not null and u.email_confirmed_at is not null)
  from auth.users u
 where u.id = p.id;

-- ───────── new user → profile (replaces the step-1 function body; trigger name unchanged) ─────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, email, phone_verified, email_verified)
  values (new.id,
          nullif(new.phone, ''),
          nullif(new.email, ''),
          nullif(new.phone, '') is not null and new.phone_confirmed_at is not null,
          nullif(new.email, '') is not null and new.email_confirmed_at is not null)
  on conflict do nothing;
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- ───────── auth.users changes (email/phone added, changed or verified) → profile copy ─────────
create or replace function public.sync_profile_identity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set phone          = nullif(new.phone, ''),
         phone_verified = nullif(new.phone, '') is not null and new.phone_confirmed_at is not null,
         email          = nullif(new.email, ''),
         email_verified = nullif(new.email, '') is not null and new.email_confirmed_at is not null
   where id = new.id;
  return null;
end $$;

drop trigger if exists on_auth_user_identity_changed on auth.users;
create trigger on_auth_user_identity_changed
  after update of email, phone, email_confirmed_at, phone_confirmed_at on auth.users
  for each row
  when (old.email is distinct from new.email
     or old.phone is distinct from new.phone
     or old.email_confirmed_at is distinct from new.email_confirmed_at
     or old.phone_confirmed_at is distinct from new.phone_confirmed_at)
  execute function public.sync_profile_identity();

-- ───────── clients can never write identity columns on profiles ─────────
-- Requests from the API carry a JWT (auth.uid() is not null). GoTrue and the sync trigger above do not.
create or replace function public.guard_profile_identity() returns trigger
language plpgsql security definer set search_path = public as $$
declare u auth.users;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- a client-created profile row can only mirror what Auth says about that same user
    select * into u from auth.users where id = new.id;
    new.phone          := nullif(u.phone, '');
    new.email          := nullif(u.email, '');
    new.phone_verified := nullif(u.phone, '') is not null and u.phone_confirmed_at is not null;
    new.email_verified := nullif(u.email, '') is not null and u.email_confirmed_at is not null;
    return new;
  end if;

  if new.phone is distinct from old.phone
     or new.email is distinct from old.email
     or new.phone_verified is distinct from old.phone_verified
     or new.email_verified is distinct from old.email_verified then
    raise exception 'email and phone are managed by sign-in settings' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_identity_guard on public.profiles;
create trigger profiles_identity_guard
  before insert or update on public.profiles
  for each row execute function public.guard_profile_identity();
