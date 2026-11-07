# Bangladesh National Blood Donor Network — Architecture

## 1. Overview

```
 React + TS PWA (Vite, Tailwind)
   │  supabase-js (anon key only)            FCM Web SDK (token only)
   ▼                                          │
 Supabase Auth (Phone OTP) ── Postgres + PostGIS (RLS on every table)
   │                              │  ▲
   │                  Realtime ───┘  │ service role (server only)
   ▼                                 │
 Edge Functions ─────────────────────┘── Firebase Cloud Messaging (HTTP v1)
   find-nearby-donors · send-blood-request-alert · donor-response-handler
   send-request-update · expire-blood-request (scheduled)
```

## 2. Core principles

- **Frontend only ever holds the anon key.** Service role key and FCM service-account JSON live only in Edge Function secrets.
- **Every table has RLS.** Clients get no direct write access to sensitive tables (`donor_responses`, `notifications`, `donation_history`, `audit_logs`); those are written by Edge Functions.
- **Location privacy.** Exact coordinates are never returned to other users. Donor search returns distance rounded to 0.5 km. Phone numbers are shared only after a donor accepts a request (and has consented).
- **Duplicate-notification prevention** is enforced by the database: unique index on `(user_id, request_id, type)` in `notifications`.
- **Notification queue + retry** live in `notifications` (`status`, `attempts`, `next_retry_at`).
- **Blood-group matching** is exact (as specified). Medical eligibility is NOT verified by the app; the next-possible-donation date is informational only.

## 3. Folder structure (planned)

```
docs/ARCHITECTURE.md
supabase/
  migrations/            ← step 1 (this step)
  functions/             ← step 6+
  seed/                  ← Bangladesh locations (step 2)
src/                     ← React app (step 3+)
public/firebase-messaging-sw.js
```

## 4. Tables (17 required + 1 extra)

profiles, donor_profiles, blood_requests, donor_responses, notifications,
notification_preferences, user_devices, donation_history, hospitals, blood_banks,
divisions, districts, upazilas, user_reports, admin_roles, messages, audit_logs
+ `unions` (needed for the Union/Area dropdown).

## 5. Roles

`super_admin` > `admin` > `moderator` stored in `admin_roles`. Checked server-side via
`public.has_role()` in RLS and in Edge Functions. Frontend route guards are UX only, not security.

## 6. Known open items (not done yet)

- Bangladesh location data (8 divisions, 64 districts, ~495 upazilas, unions) must be seeded from an authoritative source and verified.
- Edge Functions, FCM wiring, frontend, admin panel: later steps.
- Rate limiting at API level (beyond the DB trigger on request creation) needs Edge Function / gateway config.
- Medical rules (e.g. minimum gap between donations) must be reviewed by a medical advisor; the value in `next_possible_donation_date()` is a placeholder.
- Phone OTP requires an SMS provider (Twilio, MessageBird, etc.) configured in Supabase Auth, with Bangladesh coverage and cost checked.

## 7. Authentication & account linking (added in migration `20261104000001`)

- Two sign-in methods, both through Supabase Auth OTP: **Email OTP** and **Mobile SMS OTP**. Either can register or log in.
- `auth.users` is the single source of truth for a user's email, phone and their confirmation state.
  `public.profiles` keeps a **server-maintained copy** (`email`, `phone`, `email_verified`, `phone_verified`) via triggers;
  `profiles_identity_guard` rejects any client attempt to write those columns, so nobody can claim an unverified or someone
  else's identifier on a profile.
- One account = one profile = at most one donor profile (`donor_profiles.user_id` is the primary key).
- A second identifier is added to the SAME account with `updateUser` + OTP (`email_change` / `phone_change`).
  Two existing accounts are never merged automatically; if the identifier belongs to another account, Supabase answers
  `email_exists` / `phone_exists` and the UI explains the safe options.
- Resend cooldown (60 s, persisted in `sessionStorage`) and a lock after 5 wrong codes are UX guards only; Supabase enforces
  the real server-side rate limits.

## 7. Identity model (email OTP only)

- Sign-in is passwordless **Email OTP** (Supabase `signInWithOtp` + `verifyOtp`, type `email`). SMS/phone
  authentication was removed entirely; no SMS provider is needed.
- `auth.users` owns the email and its verification (`email_confirmed_at`). `public.profiles.email/email_verified`
  are a server-maintained copy (trigger `on_auth_user_identity_changed`). Clients cannot write them
  (`profiles_identity_guard`).
- `profiles.phone` is an optional, user-typed contact number. It is **never** verified (`phone_verified` stays
  false and clients cannot change it) and is not unique. It is shared only after a donor accepts a request.
- One auth user = one profile = at most one donor profile (`donor_profiles.user_id` is the primary key).
  Two separate accounts are never merged automatically.
- Request lifecycle goes through SECURITY DEFINER RPCs (`create_blood_request`, `respond_to_request`,
  `close_request`). They use a transaction-local `app.rpc_bypass` flag so the request guard trigger lets only
  these functions change status; the API cannot set that flag.
