import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { LocationItem } from './types';

let cache: Promise<LocationItem[]> | null = null;

function load(): Promise<LocationItem[]> {
  if (!cache) {
    cache = Promise.resolve(supabase.from('districts').select('id, name_en, name_bn').order('name_en')).then(({ data, error }) => {
      if (error) { cache = null; throw error; }
      return (data ?? []) as LocationItem[];
    });
  }
  return cache;
}

/** All 64 districts (public data), loaded once. */
export function useDistricts(): LocationItem[] {
  const [items, setItems] = useState<LocationItem[]>([]);
  useEffect(() => {
    let alive = true;
    load().then((d) => { if (alive) setItems(d); }).catch(() => { /* pages show their own errors */ });
    return () => { alive = false; };
  }, []);
  return items;
}

export function districtName(items: LocationItem[], id: number, lang: 'bn' | 'en'): string {
  const d = items.find((x) => x.id === id);
  return d ? (lang === 'bn' ? d.name_bn : d.name_en) : '';
}

export function fmtDateTime(iso: string, lang: 'bn' | 'en'): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}
