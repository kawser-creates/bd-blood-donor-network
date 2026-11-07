-- Step 1.1: extensions, enums, Bangladesh location hierarchy
create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create type public.blood_group as enum ('A+','A-','B+','B-','AB+','AB-','O+','O-');
create type public.gender_type as enum ('male','female','other');
create type public.availability_status as enum ('available','not_available','temporarily_unavailable');
create type public.request_priority as enum ('critical','urgent','normal');
create type public.request_status as enum
  ('pending','notification_sent','donor_responded','donor_confirmed','completed','cancelled','expired');
create type public.response_status as enum ('pending','accepted','rejected','confirmed','completed');
create type public.admin_role_type as enum ('super_admin','admin','moderator');
create type public.notification_status as enum ('queued','sent','failed','read');
create type public.report_status as enum ('open','reviewing','resolved','dismissed');

create table public.divisions (
  id int generated always as identity primary key,
  name_en text not null unique,
  name_bn text not null unique,
  centroid extensions.geography(Point,4326)
);

create table public.districts (
  id int generated always as identity primary key,
  division_id int not null references public.divisions(id) on delete restrict,
  name_en text not null,
  name_bn text not null,
  centroid extensions.geography(Point,4326),
  unique (division_id, name_en)
);
create index districts_division_idx on public.districts(division_id);

create table public.upazilas (
  id int generated always as identity primary key,
  district_id int not null references public.districts(id) on delete restrict,
  name_en text not null,
  name_bn text not null,
  centroid extensions.geography(Point,4326),
  unique (district_id, name_en)
);
create index upazilas_district_idx on public.upazilas(district_id);

create table public.unions (
  id int generated always as identity primary key,
  upazila_id int not null references public.upazilas(id) on delete restrict,
  name_en text not null,
  name_bn text not null,
  unique (upazila_id, name_en)
);
create index unions_upazila_idx on public.unions(upazila_id);
