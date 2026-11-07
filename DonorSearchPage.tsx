import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLang, type MessageKey } from '../i18n';
import { useProfile } from '../profile/ProfileContext';
import { getMyLocation } from '../lib/api';
import { BLOOD_GROUPS, type BloodGroup } from '../lib/types';
import { PAGE_SIZE, searchDonors, type DonorHit } from '../lib/requestsApi';
import { LocationPicker, type LocationValue } from '../components/LocationPicker';

const RADII = [5, 10, 25, 50] as const;
const inputClass =
  'mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';
const AVAIL_KEY: Record<string, MessageKey> = {
  available: 'available', temporarily_unavailable: 'temporarilyUnavailable', not_available: 'notAvailable',
};

export default function DonorSearchPage() {
  const { t } = useLang();
  const { profile } = useProfile();
  const [bg, setBg] = useState<BloodGroup | ''>(profile?.blood_group ?? '');
  const [mode, setMode] = useState<'nearby' | 'area'>('nearby');
  const [radius, setRadius] = useState('10');
  const [custom, setCustom] = useState('');
  const [onlyAvail, setOnlyAvail] = useState(true);
  const [loc, setLoc] = useState<LocationValue>({
    divisionId: profile?.division_id ?? null, districtId: profile?.district_id ?? null,
    upazilaId: profile?.upazila_id ?? null, unionId: null,
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [rows, setRows] = useState<DonorHit[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  function captureGps() {
    if (!('geolocation' in navigator)) { setError('locationUnsupported'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setError(null); },
      () => setError('locationDenied'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function run(p: number) {
    if (!bg) { setError('errBlood'); return; }
    const km = radius === 'custom' ? Number(custom) : Number(radius);
    if (mode === 'nearby' && (!Number.isFinite(km) || km < 1 || km > 200)) { setError('dsBadRadius'); return; }
    setBusy(true);
    setError(null);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      if (mode === 'nearby') {
        const c = coords ?? (await getMyLocation());
        if (!c) { setError('dsNoLocation'); setBusy(false); return; }
        lat = c.lat; lng = c.lng;
      } else if (!loc.districtId) {
        setError('dsNeedDistrict'); setBusy(false); return;
      }
      const data = await searchDonors({
        bloodGroup: bg, lat, lng, radiusKm: mode === 'nearby' ? km : 10,
        districtId: mode === 'area' ? loc.districtId : null, upazilaId: mode === 'area' ? loc.upazilaId : null,
        onlyAvailable: onlyAvail, page: p,
      });
      setRows((prev) => (p === 0 ? data : [...prev, ...data]));
      setMore(data.length === PAGE_SIZE);
      setPage(p);
      setSearched(true);
    } catch {
      setError('genericError');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) { e.preventDefault(); if (!busy) void run(0); }
  const tab = (on: boolean) => `flex-1 rounded-lg py-2 text-sm font-semibold ${on ? 'bg-brand-600 text-white' : 'bg-white text-gray-600'}`;

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <h1 className="mb-4 text-xl font-bold text-brand-700">{t('dsTitle')}</h1>
      <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        <label className="block text-sm font-medium">{t('bloodGroup')}
          <select value={bg} onChange={(e) => setBg(e.target.value as BloodGroup | '')} className={inputClass}>
            <option value="">{t('selectPlaceholder')}</option>
            {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="button" className={tab(mode === 'nearby')} onClick={() => setMode('nearby')}>{t('dsNearby')}</button>
          <button type="button" className={tab(mode === 'area')} onClick={() => setMode('area')}>{t('dsByArea')}</button>
        </div>
        {mode === 'nearby' ? (
          <>
            <label className="block text-sm font-medium">{t('dsRadius')}
              <select value={radius} onChange={(e) => setRadius(e.target.value)} className={inputClass}>
                {RADII.map((r) => <option key={r} value={r}>{r}</option>)}
                <option value="custom">{t('dsCustom')}</option>
              </select>
            </label>
            {radius === 'custom' && <input type="number" min={1} max={200} inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label={t('dsRadius')} className={inputClass} />}
            <button type="button" onClick={captureGps} className="w-full rounded-xl border border-brand-600 py-2.5 text-sm font-semibold text-brand-600">📍 {t('useMyLocation')}</button>
            {coords && <p className="text-sm text-green-700">{t('rqGpsSet')}</p>}
          </>
        ) : (
          <LocationPicker value={loc} onChange={setLoc} />
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyAvail} onChange={(e) => setOnlyAvail(e.target.checked)} /> {t('dsOnlyAvailable')}
        </label>
        {error && <p role="alert" className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700">{t(error)}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-60">{busy ? t('loading') : t('dsSearch')}</button>
      </form>

      <ul className="mt-4 space-y-3">
        {rows.map((d) => (
          <li key={d.donor_id} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{d.display_name || t('roleDonor')}</span>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-bold text-brand-700">{d.blood_group}</span>
            </div>
            <p className="mt-1 text-sm text-gray-600">
              {t(AVAIL_KEY[d.availability] ?? 'available')}{d.is_verified ? ` · ✔ ${t('verifiedDonor')}` : ''}
              {d.distance_km != null ? ` · ≈${Number(d.distance_km)} ${t('dsKm')}` : ''}
            </p>
            <p className="text-xs text-gray-500">{t('totalDonations')}: {d.total_donations}{d.last_donation_date ? ` · ${t('dsLastDonation')}: ${d.last_donation_date}` : ''}</p>
          </li>
        ))}
      </ul>
      {searched && rows.length === 0 && !busy && (
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>{t('dsEmpty')}</p>
          <Link to="/requests/new" className="mt-2 inline-block font-semibold text-brand-600 underline">{t('homeNewRequest')}</Link>
        </div>
      )}
      {more && !busy && <button type="button" onClick={() => void run(page + 1)} className="mt-4 w-full rounded-xl border border-brand-600 py-2.5 font-semibold text-brand-600">{t('rqLoadMore')}</button>}
      <p className="mt-4 text-xs text-gray-500">{t('dsPrivacy')}</p>
      <Link to="/" className="mt-4 block text-center text-sm text-gray-500 underline">{t('back')}</Link>
    </main>
  );
}
