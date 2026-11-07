import { useEffect, useState } from 'react';
import { listDistricts, listDivisions, listUnions, listUpazilas } from '../lib/api';
import type { GeoName } from '../lib/types';
import { useLang } from '../i18n';

export interface LocationValue {
  division_id: number | null;
  district_id: number | null;
  upazila_id: number | null;
  union_id: number | null;
}

const selectCls = 'mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-100';

/** Cascading Division → District → Upazila → Union dropdowns backed by Supabase. */
export function LocationSelect({ value, onChange, error }: {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  error?: string;
}) {
  const { t, lang } = useLang();
  const [divisions, setDivisions] = useState<GeoName[]>([]);
  const [districts, setDistricts] = useState<GeoName[]>([]);
  const [upazilas, setUpazilas] = useState<GeoName[]>([]);
  const [unions, setUnions] = useState<GeoName[]>([]);
  const [loadError, setLoadError] = useState(false);

  const name = (g: GeoName) => (lang === 'bn' ? g.name_bn : g.name_en);
  const load = <T,>(p: Promise<T>, set: (v: T) => void) =>
    p.then(set).catch(() => setLoadError(true));

  useEffect(() => { void load(listDivisions(), setDivisions); }, []);
  useEffect(() => {
    setDistricts([]);
    if (value.division_id) void load(listDistricts(value.division_id), setDistricts);
  }, [value.division_id]);
  useEffect(() => {
    setUpazilas([]);
    if (value.district_id) void load(listUpazilas(value.district_id), setUpazilas);
  }, [value.district_id]);
  useEffect(() => {
    setUnions([]);
    if (value.upazila_id) void load(listUnions(value.upazila_id), setUnions);
  }, [value.upazila_id]);

  const num = (s: string) => (s ? Number(s) : null);

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">
        {t('division')}
        <select className={selectCls} value={value.division_id ?? ''}
          onChange={(e) => onChange({ division_id: num(e.target.value), district_id: null, upazila_id: null, union_id: null })}>
          <option value="">{t('select')}</option>
          {divisions.map((d) => <option key={d.id} value={d.id}>{name(d)}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">
        {t('district')}
        <select className={selectCls} value={value.district_id ?? ''} disabled={!value.division_id}
          onChange={(e) => onChange({ ...value, district_id: num(e.target.value), upazila_id: null, union_id: null })}>
          <option value="">{t('select')}</option>
          {districts.map((d) => <option key={d.id} value={d.id}>{name(d)}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">
        {t('upazila')}
        <select className={selectCls} value={value.upazila_id ?? ''} disabled={!value.district_id}
          onChange={(e) => onChange({ ...value, upazila_id: num(e.target.value), union_id: null })}>
          <option value="">{t('select')}</option>
          {upazilas.map((d) => <option key={d.id} value={d.id}>{name(d)}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">
        {t('union')}
        <select className={selectCls} value={value.union_id ?? ''} disabled={!value.upazila_id}
          onChange={(e) => onChange({ ...value, union_id: num(e.target.value) })}>
          <option value="">{t('select')}</option>
          {unions.map((d) => <option key={d.id} value={d.id}>{name(d)}</option>)}
        </select>
      </label>
      {(error || loadError) && (
        <p role="alert" className="text-sm text-brand-700">{error ?? t('genericError')}</p>
      )}
    </div>
  );
}
