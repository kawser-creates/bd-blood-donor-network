-- Step 3.2: donor registration rules + fix for profile→donor sync being blocked by the guard
set search_path = public, extensions;

-- BUG FIX (from step 1): when a donor edited their profile, the sync trigger updated
-- donor_profiles.blood_group/location, and guard_donor_update rejected it because the acting
-- user is not an admin. A trigger-initiated update runs at trigger depth >= 2; a direct client
-- update runs at depth 1. Verification/total_donations stay protected at every depth.
create or replace function public.guard_donor_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin_or_above() then
    if new.is_verified is distinct from old.is_verified
       or new.verified_at is distinct from old.verified_at
       or new.verified_by is distinct from old.verified_by
       or new.total_donations is distinct from old.total_donations then
      raise exception 'protected donor fields' using errcode = '42501';
    end if;
    if pg_trigger_depth() < 2
       and (new.blood_group is distinct from old.blood_group
            or new.location is distinct from old.location) then
      raise exception 'blood group and location come from your profile' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- A donor profile requires a complete profile and age >= 18 (legal-adult check only;
-- medical eligibility is NOT verified by the app).
create or replace function public.guard_donor_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = new.user_id;
  if p.id is null or p.is_blocked then
    raise exception 'profile not available' using errcode = '42501';
  end if;
  if p.date_of_birth is null or p.blood_group is null or p.district_id is null then
    raise exception 'complete your profile first' using errcode = '23514';
  end if;
  if age(current_date, p.date_of_birth) < interval '18 years' then
    raise exception 'donor must be at least 18 years old' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger donor_profiles_require before insert on public.donor_profiles
  for each row execute function public.guard_donor_insert();
