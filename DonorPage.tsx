import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { AVAILABILITIES, ageFromDob, type Availability, type DonorProfile } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { useProfile } from '../profile/ProfileContext';
import { useLang, type MessageKey } from '../i18n';

const inputClass =
  'mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';

const AVAIL_KEY = {
  available: 'available',
  not_available: 'notAvailable',
  temporarily_unavailable: 'temporarilyUnavailable',
} as const satisfies Record<Availability, MessageKey>;

export default function DonorPage() {
  const { session } = useAuth();
  const { profile } = useProfile();
  const { t, lang } = useLang();
  const uid = session?.user.id ?? '';

  const [donor, setDonor] = useState<DonorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [lastDate, setLastDate] = useState('');
  const [sharePhone, setSharePhone] = useState(true);
  const [nextDate, setNextDate] = useState<string | null>(null);

  const apply = useCallback((d: DonorProfile | null) => {
    setDonor(d);
    setLastDate(d?.last_donation_date ?? '');
    setSharePhone(d?.share_phone_on_accept ?? true);
  }, []);

  const load = useCallback(async () => {
    if (!uid) return;
    const { data, error: err } = await supabase.from('donor_profiles').select('*').eq('user_id', uid).maybeSingle();
    if (err) setError(err.message || t('genericError'));
    else apply((data as DonorProfile | null) ?? null);
    setLoading(false);
  }, [uid, apply, t]);

  useEffect(() => { void load(); }, [load]);

  // Next possible donation date is computed in the database (single source for the interval).
  useEffect(() => {
    const last = donor?.last_donation_date;
    if (!last) { setNextDate(null); return; }
    let cancelled = false;
    supabase.rpc('next_possible_donation_date', { p_last: last }).then(({ data }) => {
      if (!cancelled && typeof data === 'string') setNextDate(data);
    });
    return () => { cancelled = true; };
  }, [donor?.last_donation_date]);

  const age = profile?.date_of_birth ? ageFromDob(profile.date_of_birth) : null;
  const canBecomeDonor = age !== null && age >= 18;

  async function becomeDonor() {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from('donor_profiles').insert({ user_id: uid });
    if (err) setError(err.message || t('genericError'));
    await load();
    setBusy(false);
  }

  async function changeAvailability(a: Availability) {
    if (!donor) return;
    setBusy(true);
    setError(null);
    setDone(false);
    const { error: err } = await supabase.from('donor_profiles').update({ availability: a }).eq('user_id', uid);
    if (err) setError(err.message || t('genericError'));
    else setDonor({ ...donor, availability: a });
    setBusy(false);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!donor) return;
    setDone(false);
    if (lastDate && (Number.isNaN(Date.parse(lastDate)) || new Date(lastDate) > new Date())) {
      setError(t('futureDate'));
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from('donor_profiles')
      .update({ last_donation_date: lastDate || null, share_phone_on_accept: sharePhone })
      .eq('user_id', uid);
    if (err) setError(err.message || t('genericError'));
    else { setDone(true); await load(); }
    setBusy(false);
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

  if (loading) return <div className="p-8 text-center text-gray-500">{t('loading')}</div>;

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-brand-700">{t('donorTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('donorIntro')}</p>
      </header>

      {!donor ? (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          {!canBecomeDonor && <p className="mb-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-700">{t('ageTooYoung')}</p>}
          <button onClick={() => void becomeDonor()} disabled={busy || !canBecomeDonor} className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-50">
            {busy ? t('loading') : t('becomeDonor')}
          </button>
        </section>
      ) : (
        <form onSubmit={onSave} className="space-y-5 rounded-2xl bg-white p-5 shadow-sm" noValidate>
          <div className="flex items-center justify-between text-sm">
            <span className="rounded-full bg-brand-50 px-3 py-1 font-semibold text-brand-700">{profile?.blood_group}</span>
            <span className={donor.is_verified ? 'text-green-700' : 'text-gray-500'}>
              {donor.is_verified ? `✔ ${t('verifiedDonor')}` : t('notVerifiedDonor')}
            </span>
          </div>

          <label className="block text-sm font-medium">
            {t('availability')}
            <select value={donor.availability} disabled={busy} onChange={(e) => void changeAvailability(e.target.value as Availability)} className={inputClass}>
              {AVAILABILITIES.map((a) => <option key={a} value={a}>{t(AVAIL_KEY[a])}</option>)}
            </select>
          </label>

          <label className="block text-sm font-medium">
            {t('lastDonation')}
            <input type="date" value={lastDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => { setLastDate(e.target.value); setDone(false); }} className={inputClass} />
          </label>

          {nextDate && (
            <div className="rounded-xl bg-surface p-4 text-sm">
              <p className="font-medium">{t('nextPossible')}: {fmt(nextDate)}</p>
              <p className="mt-1 text-xs text-gray-500">{t('nextPossibleNote')}</p>
            </div>
          )}

          <p className="text-sm">{t('totalDonations')}: <strong>{donor.total_donations}</strong></p>

          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={sharePhone} onChange={(e) => { setSharePhone(e.target.checked); setDone(false); }} className="mt-1 h-4 w-4 accent-brand-600" />
            <span>{t('sharePhone')}</span>
          </label>

          {error && <p role="alert" className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700">{error}</p>}
          {done && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{t('saved')}</p>}

          <button disabled={busy} className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-60">
            {busy ? t('saving') : t('save')}
          </button>
        </form>
      )}
      {!donor && error && <p role="alert" className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-700">{error}</p>}
      <Link to="/" className="mt-6 block text-center text-sm text-gray-500 underline">{t('back')}</Link>
    </main>
  );
}
