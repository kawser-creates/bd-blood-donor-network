import { supabase } from './supabase';
import type { LocationItem } from './types';

const COLS = 'id,name_en,name_bn';

async function run(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<LocationItem[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as LocationItem[];
}

export const fetchDivisions = () =>
  run(supabase.from('divisions').select(COLS).order('name_en'));
export const fetchDistricts = (divisionId: number) =>
  run(supabase.from('districts').select(COLS).eq('division_id', divisionId).order('name_en'));
export const fetchUpazilas = (districtId: number) =>
  run(supabase.from('upazilas').select(COLS).eq('district_id', districtId).order('name_en'));
export const fetchUnions = (upazilaId: number) =>
  run(supabase.from('unions').select(COLS).eq('upazila_id', upazilaId).order('name_en'));
