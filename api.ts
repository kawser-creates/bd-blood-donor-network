import { supabase } from './supabase';
import { normalizeBdPhone } from './phone';
import { AVATAR_TYPES, validateAvatar } from './validation';
import type { Availability, DonorProfile, GeoName, Profile, ProfilePatch } from './types';

const PROFILE_COLS = 'id, full_name, avatar_url, phone, email, date_of_birth, gender, blood_group, division_id, district_id, upazila_id, union_id, area_text, emergency_contact_name, emergency_contact_phone, language';
const DONOR_COLS = 'user_id, availability, last_donation_date, total_donations, is_verified, share_phone_on_accept';

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLS).eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function saveProfile(userId: string, patch: ProfilePatch): Promise<void> {
  // email/phone are owned by Supabase Auth (see migration 20261104000001); the database rejects
  // client writes to them, so never send them from here.
  const { email: _ignoredEmail, ...rest } = patch;
  void _ignoredEmail;
  const clean: ProfilePatch = {
    ...rest,
    full_name: patch.full_name?.trim() ?? null,
    area_text: patch.area_text?.trim() || null,
    emergency_contact_name: patch.emergency_contact_name?.trim() || null,
    emergency_contact_phone: patch.emergency_contact_phone
      ? normalizeBdPhone(patch.emergency_contact_phone) ?? patch.emergency_contact_phone
      : null,
  };
  const { error } = await supabase.from('profiles').update(clean).eq('id', userId);
  if (error) throw error;
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!validateAvatar(file)) throw new Error('invalid_avatar');
  const ext = AVATAR_TYPES[file.type];
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const { error: upErr } = await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', userId);
  if (upErr) throw upErr;
  return data.publicUrl;
}

// ── locations (public read) ──
export async function listDivisions(): Promise<GeoName[]> {
  const { data, error } = await supabase.from('divisions').select('id, name_en, name_bn').order('name_en');
  if (error) throw error;
  return data ?? [];
}
export async function listDistricts(divisionId: number): Promise<GeoName[]> {
  const { data, error } = await supabase.from('districts').select('id, name_en, name_bn').eq('division_id', divisionId).order('name_en');
  if (error) throw error;
  return data ?? [];
}
export async function listUpazilas(districtId: number): Promise<GeoName[]> {
  const { data, error } = await supabase.from('upazilas').select('id, name_en, name_bn').eq('district_id', districtId).order('name_en');
  if (error) throw error;
  return data ?? [];
}
export async function listUnions(upazilaId: number): Promise<GeoName[]> {
  const { data, error } = await supabase.from('unions').select('id, name_en, name_bn').eq('upazila_id', upazilaId).order('name_en').limit(200);
  if (error) throw error;
  return data ?? [];
}

// ── GPS ──
export async function saveMyLocation(lat: number, lng: number): Promise<void> {
  const { error } = await supabase.rpc('set_my_location', { p_lat: lat, p_lng: lng });
  if (error) throw error;
}
export async function getMyLocation(): Promise<{ lat: number; lng: number } | null> {
  const { data, error } = await supabase.rpc('get_my_location');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { lat: row.lat, lng: row.lng } : null;
}

// ── donor ──
export async function getDonor(userId: string): Promise<DonorProfile | null> {
  const { data, error } = await supabase.from('donor_profiles').select(DONOR_COLS).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data as DonorProfile | null;
}
export async function becomeDonor(userId: string): Promise<void> {
  const { error } = await supabase.from('donor_profiles').insert({ user_id: userId });
  if (error) throw error;
}
export async function updateDonor(
  userId: string,
  patch: Partial<Pick<DonorProfile, 'availability' | 'last_donation_date' | 'share_phone_on_accept'>>,
): Promise<void> {
  const { error } = await supabase.from('donor_profiles').update(patch).eq('user_id', userId);
  if (error) throw error;
}
export async function leaveDonorList(userId: string): Promise<void> {
  const { error } = await supabase.from('donor_profiles').delete().eq('user_id', userId);
  if (error) throw error;
}
export async function nextDonationDate(last: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('next_possible_donation_date', { p_last: last });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export type { Availability };
