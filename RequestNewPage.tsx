import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLang, type MessageKey } from '../i18n';
import { useProfile } from '../profile/ProfileContext';
import { normalizeBdPhone } from '../lib/phone';
import { BLOOD_GROUPS, type BloodGroup } from '../lib/types';
import { createRequest, PRIORITIES, PRIORITY_KEY, type Priority } from '../lib/requestsApi';
import { LocationPicker, type LocationValue } from '../components/LocationPicker';

const inputClass =
  'mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';

function localInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function RequestNewPage() {
  const { t } = useLang();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const [bg, setBg] = useState<BloodGroup | ''>(profile?.blood_group ?? '');
  const [bags, setBags] = useState('1');
  const [hospital, setHospital] = useState('');
  const [address, setAddress] = useState('');
  const [loc, setLoc] = useState<LocationValue>({
    divisionId: profile?.division_id ?? null, districtId: profile?.district_id ?? null,
    upazilaId: profile?.upazila_id ?? null, unionId: null,
  });
  const [when, setWhen] = useState(() => localInputValue(new Date(Date.now() + 3 * 3600 * 1000)));
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [priority, setPriority] = useState<Priority>('urgent');
  const [patient, setPatient] = useState('');
  const [desc, setDesc] = useState('');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  function useGps() {
    if (!('geolocation' in navigator)) { setError('locationUnsupported'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setError(null); },
      () => setError('locationDenied'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const n = Number(bags);
    const contact = normalizeBdPhone(phone);
    const whenDate = new Date(when);
    if (!bg) return setError('errBlood');
    if (!Number.isInteger(n) || n < 1 || n > 20) return setError('rqErrBags');
    if (hospital.trim().length < 2 || address.trim().length < 2) return setError('rqErrHospital');
    if (!loc.districtId) return setError('rqErrDistrict');
    if (Number.isNaN(whenDate.getTime()) || whenDate.getTime() < Date.now() - 3600 * 1000) return setError('rqErrWhen');
    if (!contact) return setError('rqErrContact');

    setBusy(true);
    setError(null);
    try {
      const id = await createRequest({
        bloodGroup: bg, bags: n, hospitalName: hospital, hospitalAddress: address, districtId: loc.districtId,
        upazilaId: loc.upazilaId, requiredAt: whenDate.toISOString(), contactPhone: contact, priority,
        description: desc, patientName: patient, lat: gps?.lat ?? null, lng: gps?.lng ?? null,
      });
      navigate(`/requests/${id}`, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(/request limit/i.test(msg) ? 'rqErrLimit' : 'genericError');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <h1 className="mb-4 text-xl font-bold text-brand-700">{t('rqFormTitle')}</h1>
      <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        <label className="block text-sm font-medium">{t('bloodGroup')}
          <select value={bg} onChange={(e) => setBg(e.target.value as BloodGroup | '')} className={inputClass}>
            <option value="">{t('selectPlaceholder')}</option>
            {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">{t('rqBagsLabel')}
          <input type="number" min={1} max={20} inputMode="numeric" value={bags} onChange={(e) => setBags(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm font-medium">{t('rqPriorityLabel')}
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={inputClass}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{t(PRIORITY_KEY[p])}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">{t('rqPatient')}
          <input value={patient} maxLength={100} onChange={(e) => setPatient(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm font-medium">{t('rqHospital')}
          <input value={hospital} maxLength={200} onChange={(e) => setHospital(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm font-medium">{t('rqHospitalAddress')}
          <input value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
        </label>
        <LocationPicker value={loc} onChange={setLoc} />
        <button type="button" onClick={useGps} className="w-full rounded-xl border border-brand-600 py-2.5 text-sm font-semibold text-brand-600">📍 {t('rqUseGps')}</button>
        {gps && <p className="text-sm text-green-700">{t('rqGpsSet')}</p>}
        <label className="block text-sm font-medium">{t('rqWhen')}
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm font-medium">{t('rqContact')}
          <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('phonePlaceholder')} className={inputClass} />
          <span className="mt-1 block text-xs font-normal text-gray-500">{t('rqContactPrivacy')}</span>
        </label>
        <label className="block text-sm font-medium">{t('rqDescription')}
          <textarea value={desc} maxLength={1000} rows={3} onChange={(e) => setDesc(e.target.value)} className={inputClass} />
        </label>
        {error && <p role="alert" className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700">{t(error)}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-60">{busy ? t('saving') : t('rqSubmit')}</button>
        <Link to="/requests" className="block text-center text-sm text-gray-500 underline">{t('back')}</Link>
      </form>
    </main>
  );
}
