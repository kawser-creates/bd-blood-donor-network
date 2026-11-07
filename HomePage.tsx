import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useProfile } from '../profile/ProfileContext';
import { useLang } from '../i18n';
import { dashboardStats, getMyRole, type Stats } from '../lib/requestsApi';

const link = 'block rounded-xl bg-brand-50 px-4 py-3 font-medium text-brand-700';

export default function HomePage() {
  const { session, signOut } = useAuth();
  const { profile } = useProfile();
  const { t } = useLang();
  const uid = session?.user.id ?? '';
  const [stats, setStats] = useState<Stats | null>(null);
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    dashboardStats().then(setStats).catch(() => setStats(null));
    getMyRole(uid).then((r) => setIsStaff(!!r)).catch(() => setIsStaff(false));
  }, [uid]);

  const cards: [string, number][] = stats
    ? [[t('statDonors'), stats.total_donors], [t('statAvailable'), stats.available_donors], [t('statRequests'), stats.total_requests], [t('statDonations'), stats.successful_donations]]
    : [];

  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-brand-700">{t('homeWelcome')}, {profile?.full_name}</h1>
        {cards.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {cards.map(([label, n]) => (
              <div key={label} className="rounded-xl bg-surface p-3"><p className="text-xl font-bold text-brand-700">{n}</p><p className="text-xs text-gray-500">{label}</p></div>
            ))}
          </div>
        )}
        <div className="mt-5 space-y-3">
          <Link to="/requests/new" className="block rounded-xl bg-brand-600 px-4 py-3 text-center font-semibold text-white">{t('homeNewRequest')}</Link>
          <Link to="/donors" className={link}>{t('homeFindDonors')}</Link>
          <Link to="/requests" className={link}>{t('homeRequests')}</Link>
          <Link to="/donor" className={link}>{t('goDonor')}</Link>
          <Link to="/profile" className={link}>{t('goProfile')}</Link>
          {isStaff && <Link to="/admin" className={link}>{t('homeAdmin')}</Link>}
        </div>
        <button onClick={() => void signOut()} className="mt-6 w-full rounded-xl border border-brand-600 py-3 font-semibold text-brand-600">
          {t('signOut')}
        </button>
      </section>
    </main>
  );
}
