import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n';

/** Read-only: the sign-in email and whether Supabase has verified it. Email is the only sign-in method. */
export function EmailStatus() {
  const { session } = useAuth();
  const { t } = useLang();
  const user = session?.user;
  if (!user?.email) return null;
  const verified = !!user.email_confirmed_at;
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm" aria-labelledby="email-status-title">
      <h2 id="email-status-title" className="text-lg font-semibold">{t('emailAccount')}</h2>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-gray-200 p-3">
        <span className="break-all text-sm text-gray-700">{user.email}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${verified ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
          {verified ? `✔ ${t('verifiedBadge')}` : t('notVerifiedBadge')}
        </span>
      </div>
      <p className="mt-2 text-xs text-gray-500">{t('emailVerifiedHint')}</p>
    </section>
  );
}
