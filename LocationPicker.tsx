import { useEffect, useState } from 'react';
import { useLang } from '../i18n';
import { fetchDistricts, fetchDivisions, fetchUnions, fetchUpazilas } from '../lib/locations';
import type { LocationItem } from '../lib/types';

export type LocationValue = {
  divisionId: number | null;
  districtId: number | null;
  upazilaId: number | null;
  unionId: number | null;
};

type Props = { value: LocationValue; onChange: (v: LocationValue) => void; disabled?: boolean };

const selectClass =
  'mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-100';

export function LocationPicker({ value, onChange, disabled }: Props) {
  const { t, lang } = useLang();
  const [divisions, setDivisions] = useState<LocationItem[]>([]);
  const [districts, setDistricts] = useState<LocationItem[]>([]);
  const [upazilas, setUpazilas] = useState<LocationItem[]>([]);
  const [unions, setUnions] = useState<LocationItem[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchDivisions().then((r) => { if (!cancelled) setDivisions(r); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (value.divisionId == null) { setDistricts([]); return; }
    fetchDistricts(value.divisionId).then((r) => { if (!cancelled) setDistricts(r); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [value.divisionId]);

  useEffect(() => {
    let cancelled = false;
    if (value.districtId == null) { setUpazilas([]); return; }
    fetchUpazilas(value.districtId).then((r) => { if (!cancelled) setUpazilas(r); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [value.districtId]);

  useEffect(() => {
    let cancelled = false;
    if (value.upazilaId == null) { setUnions([]); return; }
    fetchUnions(value.upazilaId).then((r) => { if (!cancelled) setUnions(r); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [value.upazilaId]);

  const name = (i: LocationItem) => (lang === 'bn' ? i.name_bn : i.name_en);
  const toId = (s: string) => (s === '' ? null : Number(s));

  function field(label: string, items: LocationItem[], current: number | null, off: boolean, set: (id: number | null) => void) {
    return (
      <label className="block text-sm font-medium">
        {label}
        <select
          className={selectClass}
          value={current ?? ''}
          disabled={disabled || off}
          onChange={(e) => set(toId(e.target.value))}
        >
          <option value="">{t('selectPlaceholder')}</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>{name(i)}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="space-y-4">
      {field(t('division'), divisions, value.divisionId, false, (id) =>
        onChange({ divisionId: id, districtId: null, upazilaId: null, unionId: null }))}
      {field(t('district'), districts, value.districtId, value.divisionId == null, (id) =>
        onChange({ ...value, districtId: id, upazilaId: null, unionId: null }))}
      {field(t('upazila'), upazilas, value.upazilaId, value.districtId == null, (id) =>
        onChange({ ...value, upazilaId: id, unionId: null }))}
      {field(t('union'), unions, value.unionId, value.upazilaId == null, (id) =>
        onChange({ ...value, unionId: id }))}
      {failed && <p role="alert" className="text-sm text-brand-700">{t('locationLoadError')}</p>}
    </div>
  );
}
