import { normalizeBdPhone } from './phone';
import type { MessageKey } from '../messages';
import type { ProfilePatch } from './types';

export type FieldErrors = Partial<Record<keyof ProfilePatch, MessageKey>>;

export function ageInYears(dob: string, today: Date = new Date()): number {
  const d = new Date(dob + 'T00:00:00');
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

export function validateProfile(p: ProfilePatch, today: Date = new Date()): FieldErrors {
  const e: FieldErrors = {};
  if (!p.full_name || p.full_name.trim().length < 2) e.full_name = 'reqName';
  if (!p.date_of_birth || Number.isNaN(Date.parse(p.date_of_birth))
      || new Date(p.date_of_birth) >= today || ageInYears(p.date_of_birth, today) > 120) {
    e.date_of_birth = 'reqDob';
  }
  if (!p.gender) e.gender = 'reqGender';
  if (!p.blood_group) e.blood_group = 'reqBlood';
  if (!p.division_id || !p.district_id || !p.upazila_id) e.upazila_id = 'reqLocation';
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) e.email = 'invalidEmail';
  if (p.emergency_contact_phone && !normalizeBdPhone(p.emergency_contact_phone)) {
    e.emergency_contact_phone = 'invalidEmergencyPhone';
  }
  return e;
}

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function validateAvatar(file: { type: string; size: number }): boolean {
  return file.type in AVATAR_TYPES && file.size > 0 && file.size <= AVATAR_MAX_BYTES;
}
