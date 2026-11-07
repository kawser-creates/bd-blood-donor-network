export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = (typeof GENDERS)[number];
export const AVAILABILITIES = ['available', 'not_available', 'temporarily_unavailable'] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  email: string | null;
  /** Server-maintained copies of Supabase Auth's confirmation state (clients cannot write them). */
  email_verified?: boolean;
  phone_verified?: boolean;
  date_of_birth: string | null;
  gender: Gender | null;
  blood_group: BloodGroup | null;
  division_id: number | null;
  district_id: number | null;
  upazila_id: number | null;
  union_id: number | null;
  area_text: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  language: 'bn' | 'en';
}

export type ProfilePatch = Partial<Omit<Profile, 'id' | 'language' | 'email_verified' | 'phone_verified'>>;

export interface DonorProfile {
  user_id: string;
  availability: Availability;
  last_donation_date: string | null;
  total_donations: number;
  is_verified: boolean;
  share_phone_on_accept: boolean;
}

export type LocationItem = { id: number; name_en: string; name_bn: string };

export interface GeoName {
  id: number;
  name_en: string;
  name_bn: string;
}

export function isProfileComplete(p: Profile | null): boolean {
  return !!p && !!p.full_name && !!p.date_of_birth && !!p.gender && !!p.blood_group
    && !!p.division_id && !!p.district_id && !!p.upazila_id;
}

/** Whole years between a YYYY-MM-DD date of birth and today; null if the date is invalid or in the future. */
export function ageFromDob(dob: string, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age -= 1;
  return age >= 0 ? age : null;
}
