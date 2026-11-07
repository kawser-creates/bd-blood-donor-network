import { supabase } from './supabase';
import type { BloodGroup } from './types';

import { PAGE_SIZE, type Priority, type RequestStatus } from './requestsMeta';
export * from './requestsMeta';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = 'id, request_code, blood_group, bags_needed, hospital_name, hospital_address, district_id, upazila_id, required_at, priority, status, description, created_at';

export type RequestRow = {
  id: string; request_code: string; blood_group: BloodGroup; bags_needed: number;
  hospital_name: string; hospital_address: string; district_id: number; upazila_id: number | null;
  required_at: string; priority: Priority; status: RequestStatus; description: string | null; created_at: string;
};
/** requester_id / contact_phone are present only when RLS lets this user see the full row (owner, staff, responder). */
export type RequestDetail = RequestRow & { requester_id?: string; contact_phone?: string };

export type Contact = { user_id: string; full_name: string | null; phone: string | null; contact_role: 'donor' | 'requester' };
export type DonorHit = {
  donor_id: string; display_name: string; blood_group: BloodGroup; availability: string; is_verified: boolean;
  total_donations: number; last_donation_date: string | null; distance_km: number | string | null;
};

const range = (page: number) => [page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1] as const;

export async function listOpenRequests(f: { bloodGroup: BloodGroup | ''; districtId: number | null; page: number }): Promise<RequestRow[]> {
  let q = supabase.from('public_blood_requests').select(COLS).order('created_at', { ascending: false });
  if (f.bloodGroup) q = q.eq('blood_group', f.bloodGroup);
  if (f.districtId) q = q.eq('district_id', f.districtId);
  const [a, b] = range(f.page);
  const { data, error } = await q.range(a, b);
  if (error) throw error;
  return (data ?? []) as RequestRow[];
}

export async function listMyRequests(userId: string, page: number): Promise<RequestRow[]> {
  const [a, b] = range(page);
  const { data, error } = await supabase.from('blood_requests').select(COLS).eq('requester_id', userId)
    .order('created_at', { ascending: false }).range(a, b);
  if (error) throw error;
  return (data ?? []) as RequestRow[];
}

/** Full row when RLS allows it (owner / accepted donor / staff), otherwise the privacy-safe public view. */
export async function getRequest(id: string): Promise<RequestDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const own = await supabase.from('blood_requests').select(`${COLS}, requester_id, contact_phone`).eq('id', id).maybeSingle();
  if (own.error) throw own.error;
  if (own.data) return own.data as RequestDetail;
  const pub = await supabase.from('public_blood_requests').select(COLS).eq('id', id).maybeSingle();
  if (pub.error) throw pub.error;
  return (pub.data as RequestDetail | null) ?? null;
}

export type NewRequest = {
  bloodGroup: BloodGroup; bags: number; hospitalName: string; hospitalAddress: string;
  districtId: number; upazilaId: number | null; requiredAt: string; contactPhone: string;
  priority: Priority; description: string; patientName: string; lat: number | null; lng: number | null;
};

export async function createRequest(r: NewRequest): Promise<string> {
  const { data, error } = await supabase.rpc('create_blood_request', {
    p_blood_group: r.bloodGroup, p_bags: r.bags, p_hospital_name: r.hospitalName, p_hospital_address: r.hospitalAddress,
    p_district_id: r.districtId, p_upazila_id: r.upazilaId, p_required_at: r.requiredAt, p_contact_phone: r.contactPhone,
    p_priority: r.priority, p_description: r.description, p_patient_name: r.patientName, p_lat: r.lat, p_lng: r.lng,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { out_id: string } | undefined;
  if (!row?.out_id) throw new Error('no id returned');
  return row.out_id;
}

export async function respondToRequest(id: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_to_request', { p_request_id: id, p_accept: accept });
  if (error) throw error;
}

export async function closeRequest(id: string, status: 'completed' | 'cancelled'): Promise<void> {
  const { error } = await supabase.rpc('close_request', { p_request_id: id, p_status: status });
  if (error) throw error;
}

/** Only returns people who accepted (and, for donors, agreed to share their phone). Empty for everyone else. */
export async function getContacts(id: string): Promise<Contact[]> {
  const { data, error } = await supabase.rpc('get_request_contacts', { p_request_id: id });
  if (error) throw error;
  return (data ?? []) as Contact[];
}

export async function getMyResponse(requestId: string, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('donor_responses').select('status').eq('request_id', requestId).eq('donor_id', userId).maybeSingle();
  if (error) throw error;
  return (data as { status: string } | null)?.status ?? null;
}

export async function countAccepted(requestId: string): Promise<number> {
  const { data, error } = await supabase.from('donor_responses').select('status').eq('request_id', requestId);
  if (error) throw error;
  return ((data ?? []) as { status: string }[]).filter((r) => r.status === 'accepted' || r.status === 'confirmed').length;
}

export async function searchDonors(a: {
  bloodGroup: BloodGroup; lat: number | null; lng: number | null; radiusKm: number;
  districtId: number | null; upazilaId: number | null; onlyAvailable: boolean; page: number;
}): Promise<DonorHit[]> {
  const { data, error } = await supabase.rpc('find_nearby_donors', {
    p_blood_group: a.bloodGroup, p_lat: a.lat, p_lng: a.lng, p_radius_km: a.radiusKm,
    p_district_id: a.districtId, p_upazila_id: a.upazilaId, p_only_available: a.onlyAvailable,
    p_limit: PAGE_SIZE, p_offset: a.page * PAGE_SIZE,
  });
  if (error) throw error;
  return (data ?? []) as DonorHit[];
}

export type Stats = {
  total_donors: number; available_donors: number; total_requests: number; successful_donations: number;
  emergency_requests: number; by_blood_group: Record<string, number>;
};
export async function dashboardStats(): Promise<Stats> {
  const { data, error } = await supabase.rpc('dashboard_stats');
  if (error) throw error;
  return data as Stats;
}

// ── admin (RLS decides; these calls simply fail for non-staff) ──
export type AdminRole = 'super_admin' | 'admin' | 'moderator';
export async function getMyRole(userId: string): Promise<AdminRole | null> {
  const { data, error } = await supabase.from('admin_roles').select('role').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return ((data as { role: AdminRole } | null)?.role) ?? null;
}

export type AdminUser = { id: string; full_name: string | null; email: string | null; email_verified: boolean; blood_group: BloodGroup | null; is_blocked: boolean; created_at: string };
export async function adminListUsers(page: number, search: string): Promise<AdminUser[]> {
  let q = supabase.from('profiles').select('id, full_name, email, email_verified, blood_group, is_blocked, created_at').order('created_at', { ascending: false });
  const s = search.trim().replace(/[%,()*\\]/g, ' ').slice(0, 60).trim();
  if (s) q = q.ilike('full_name', `%${s}%`);
  const [a, b] = range(page);
  const { data, error } = await q.range(a, b);
  if (error) throw error;
  return (data ?? []) as AdminUser[];
}
export async function adminSetBlocked(userId: string, blocked: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_blocked: blocked }).eq('id', userId);
  if (error) throw error;
}
export async function adminListRequests(page: number, status: RequestStatus | ''): Promise<RequestRow[]> {
  let q = supabase.from('blood_requests').select(COLS).order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const [a, b] = range(page);
  const { data, error } = await q.range(a, b);
  if (error) throw error;
  return (data ?? []) as RequestRow[];
}
export async function adminSetRequestStatus(id: string, status: RequestStatus): Promise<void> {
  const { error } = await supabase.from('blood_requests').update({ status }).eq('id', id);
  if (error) throw error;
}
