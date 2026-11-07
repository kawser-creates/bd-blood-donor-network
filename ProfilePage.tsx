import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { normalizeBdPhone } from '../lib/phone';
import { BLOOD_GROUPS, GENDERS, isProfileComplete, type BloodGroup, type Gender, type Profile } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { useProfile } from '../profile/ProfileContext';
import { useLang, type MessageKey } from '../i18n';
import { LocationPicker, type LocationValue } from '../components/LocationPicker';
import { EmailStatus } from '../components/EmailStatus';

type Form = {
  fullName: string;
  dob: string;
  gender: Gender | '';
  bloodGroup: BloodGroup | '';
  loc: LocationValue;
  areaText: string;
  phone: string;
  emergencyName: string;
  emergencyPhone: string;
  avatarUrl: string | null;
};

function toForm(p: Profile | null): Form {
  return {
    fullName: p?.full_name ?? '',
    dob: p?.date_of_birth ?? '',
    gender: p?.gender ?? '',
    bloodGroup: p?.blood_group ?? '',
    loc: {
      divisionId: p?.division_id ?? null,
      districtId: p?.district_id ?? null,
      upazilaId: p?.upazila_id ?? null,
      unionId: p?.union_id ?? null,
    },
    areaText: p?.area_text ?? '',
    phone: p?.phone ?? '',
    emergencyName: p?.emergency_contact_name ?? '',
    emergencyPhone: p?.emergency_contact_phone ?? '',
    avatarUrl: p?.avatar_url ?? null,
  };
}

const ALLOWED_IMAGES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const inputClass =
  'mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';

function validate(f: Form): MessageKey | null {
  if (f.fullName.trim().length < 2) return 'errName';
  if (!f.dob || Number.isNaN(Date.parse(f.dob)) || new Date(f.dob) > new Date()) return 'errDob';
  if (!f.gender) return 'errGender';
  if (!f.bloodGroup) return 'errBlood';
  if (!f.loc.divisionId || !f.loc.districtId || !f.loc.upazilaId) return 'errDistrict';
  if (f.phone.trim() && !normalizeBdPhone(f.phone)) return 'invalidPhone';
  if (f.emergencyPhone.trim() && !normalizeBdPhone(f.emergencyPhone)) return 'errEmergencyPhone';
  return null;
}

export default function ProfilePage() {
  const { session } = useAuth();
  const { profile, refresh } = useProfile();
  const { t } = useLang();
  const navigate = useNavigate();
  const uid = session?.user.id ?? '';
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<Form>(() => toForm(profile));
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [hasSavedLocation, setHasSavedLocation] = useState(false);
  const [gpsMsg, setGpsMsg] = useState<MessageKey | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!uid) return;
    supabase.rpc('get_my_location').then(({ data }) => {
      setHasSavedLocation(Array.isArray(data) && data.length > 0);
    });
  }, [uid]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setDone(false);
    setForm((f) => ({ ...f, [k]: v }));
  };

  function captureLocation() {
    setGpsMsg(null);
    if (!('geolocation' in navigator)) { setGpsMsg('locationUnsupported'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsMsg('locationTaken'); setDone(false); },
      () => setGpsMsg('locationDenied'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !uid) return;
    if (!ALLOWED_IMAGES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      setError(t('photoInvalid'));
      return;
    }
    setError(null);
    setUploading(true);
    const path = `${uid}/avatar`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
    setUploading(false);
    if (upErr) { setError(upErr.message || t('genericError')); return; }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    set('avatarUrl', `${data.publicUrl}?v=${Date.now()}`);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    const problem = validate(form);
    if (problem) { setError(t(problem)); return; }
    setError(null);
    setSaving(true);

    const contactPhone = form.phone.trim() ? normalizeBdPhone(form.phone) : null;
    const ecPhone = form.emergencyPhone.trim() ? normalizeBdPhone(form.emergencyPhone) : null;
    const { error: upErr } = await supabase
      .from('profiles')
      .update({
        full_name: form.fullName.trim(),
        date_of_birth: form.dob,
        gender: form.gender,
        blood_group: form.bloodGroup,
        division_id: form.loc.divisionId,
        district_id: form.loc.districtId,
        upazila_id: form.loc.upazilaId,
        union_id: form.loc.unionId,
        area_text: form.areaText.trim() || null,
        phone: contactPhone,
        emergency_contact_name: form.emergencyName.trim() || null,
        emergency_contact_phone: ecPhone,
        avatar_url: form.avatarUrl,
      })
      .eq('id', uid);
    if (upErr) { setSaving(false); setError(upErr.message || t('genericError')); return; }

    if (gps) {
      const { error: locErr } = await supabase.rpc('set_my_location', { p_lat: gps.lat, p_lng: gps.lng });
      if (locErr) { setSaving(false); setError(locErr.message || t('genericError')); return; }
      setHasSavedLocation(true);
      setGps(null);
      setGpsMsg(null);
    }

    await refresh();
    setSaving(false);
    setDone(true);
    if (!isProfileComplete(profile)) navigate('/', { replace: true });
  }

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-brand-700">{t('profileTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('profileIntro')}</p>
      </header>

      <form onSubmit={onSubmit} className="space-y-5 rounded-2xl bg-white p-5 shadow-sm" noValidate>
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-brand-50">
            {form.avatarUrl ? (
              <img src={form.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl">👤</div>
            )}
          </div>
          <div>
            <p className="text-sm font-medium">{t('photo')}</p>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPhoto} />
            <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="mt-1 text-sm text-brand-600 underline disabled:text-gray-400">
              {uploading ? t('photoUploading') : t('changePhoto')}
            </button>
          </div>
        </div>

        <label className="block text-sm font-medium">
          {t('fullName')}
          <input value={form.fullName} maxLength={100} onChange={(e) => set('fullName', e.target.value)} autoComplete="name" className={inputClass} />
        </label>

        <label className="block text-sm font-medium">
          {t('dob')}
          <input type="date" value={form.dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set('dob', e.target.value)} className={inputClass} />
        </label>

        <label className="block text-sm font-medium">
          {t('gender')}
          <select value={form.gender} onChange={(e) => set('gender', e.target.value as Gender | '')} className={inputClass}>
            <option value="">{t('selectPlaceholder')}</option>
            {GENDERS.map((g) => <option key={g} value={g}>{t(g)}</option>)}
          </select>
        </label>

        <label className="block text-sm font-medium">
          {t('bloodGroup')}
          <select value={form.bloodGroup} onChange={(e) => set('bloodGroup', e.target.value as BloodGroup | '')} className={inputClass}>
            <option value="">{t('selectPlaceholder')}</option>
            {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>

        <LocationPicker value={form.loc} onChange={(loc) => set('loc', loc)} disabled={saving} />

        <label className="block text-sm font-medium">
          {t('areaText')}
          <input value={form.areaText} maxLength={200} onChange={(e) => set('areaText', e.target.value)} className={inputClass} />
        </label>

        <div className="rounded-xl bg-surface p-4">
          <button type="button" onClick={captureLocation} className="w-full rounded-xl border border-brand-600 py-2.5 text-sm font-semibold text-brand-600">
            📍 {t('useMyLocation')}
          </button>
          {gpsMsg && <p className="mt-2 text-sm text-gray-700">{t(gpsMsg)}</p>}
          {!gpsMsg && hasSavedLocation && <p className="mt-2 text-sm text-green-700">{t('locationSaved')}</p>}
          <p className="mt-2 text-xs text-gray-500">{t('locationHelp')}</p>
        </div>

        <label className="block text-sm font-medium">
          {t('contactPhone')}
          <input type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} />
          <span className="mt-1 block text-xs font-normal text-gray-500">{t('contactPhoneHint')}</span>
        </label>

        <label className="block text-sm font-medium">
          {t('emergencyName')}
          <input value={form.emergencyName} maxLength={100} onChange={(e) => set('emergencyName', e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          {t('emergencyPhone')}
          <input type="tel" inputMode="tel" value={form.emergencyPhone} onChange={(e) => set('emergencyPhone', e.target.value)} className={inputClass} />
        </label>

        {error && <p role="alert" className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700">{error}</p>}
        {done && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{t('saved')}</p>}

        <button disabled={saving || uploading} className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-60">
          {saving ? t('saving') : t('save')}
        </button>
        {isProfileComplete(profile) && (
          <Link to="/" className="block text-center text-sm text-gray-500 underline">{t('back')}</Link>
        )}
      </form>

      <EmailStatus />
    </main>
  );
}
