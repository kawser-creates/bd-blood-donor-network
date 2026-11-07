import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n';
import {
  adminListRequests, adminListUsers, adminSetBlocked, adminSetRequestStatus, dashboardStats, getMyRole,
  PAGE_SIZE, REQUEST_STATUSES, STATUS_KEY, type AdminRole, type AdminUser, type RequestRow, type RequestStatus, type Stats,
} from '../lib/requestsApi';
import { fmtDateTime } from '../lib/useDistricts';

type Tab = 'overview' | 'users' | 'requests';

/** UX only. The database (RLS + triggers) is what actually refuses non-staff and moderators. */
export default function AdminPage() {
  const { t, lang } = useLang();
  const { session } = useAuth();
  const uid = session?.user.id ?? '';
  const [role, setRole] = useState<AdminRole | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => { getMyRole(uid).then(setRole).catch(() => setRole(null)); }, [uid]);

  if (role === undefined) return <p className="p-8 text-center text-gray-500">{t('loading')}</p>;
  if (!role) {
    return (
      <main className="mx-auto max-w-md px-5 py-10 text-center">
        <p className="text-gray-600">{t('adNotAllowed')}</p>
        <Link to="/" className="mt-4 inline-block text-brand-600 underline">{t('back')}</Link>
      </main>
    );
  }
  const tabBtn = (k: Tab, label: string) => (
    <button type="button" onClick={() => setTab(k)} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === k ? 'bg-brand-600 text-white' : 'bg-white text-gray-600'}`}>{label}</button>
  );
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-xl font-bold text-brand-700">{t('adTitle')}</h1>
      <p className="mb-4 text-xs text-gray-500">{t('adRole')}: {role}</p>
      <div className="mb-4 flex gap-2">{tabBtn('overview', t('adOverview'))}{tabBtn('users', t('adUsers'))}{tabBtn('requests', t('adRequests'))}</div>
      {tab === 'overview' && <Overview />}
      {tab === 'users' && <Users canBlock={role === 'admin' || role === 'super_admin'} />}
      {tab === 'requests' && <Requests lang={lang} />}
      <Link to="/" className="mt-6 block text-center text-sm text-gray-500 underline">{t('back')}</Link>
    </main>
  );
}

function Overview() {
  const { t } = useLang();
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { dashboardStats().then(setS).catch(() => setErr(true)); }, []);
  if (err) return <p className="text-sm text-brand-700">{t('genericError')}</p>;
  if (!s) return <p className="text-sm text-gray-500">{t('loading')}</p>;
  const cards: [string, number][] = [
    [t('statDonors'), s.total_donors], [t('statAvailable'), s.available_donors], [t('statRequests'), s.total_requests],
    [t('statDonations'), s.successful_donations], [t('statEmergency'), s.emergency_requests],
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {cards.map(([label, n]) => <div key={label} className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-2xl font-bold text-brand-700">{n}</p><p className="text-xs text-gray-500">{label}</p></div>)}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {Object.entries(s.by_blood_group).map(([g, n]) => <div key={g} className="rounded-xl bg-white p-2 text-center shadow-sm"><p className="font-bold text-brand-700">{g}</p><p className="text-sm">{n}</p></div>)}
      </div>
    </>
  );
}

function Users({ canBlock }: { canBlock: boolean }) {
  const { t } = useLang();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const load = useCallback(async (p: number, replace: boolean) => {
    setLoading(true); setErr(false);
    try {
      const d = await adminListUsers(p, q);
      setRows((prev) => (replace ? d : [...prev, ...d])); setMore(d.length === PAGE_SIZE); setPage(p);
    } catch { setErr(true); } finally { setLoading(false); }
  }, [q]);
  useEffect(() => { void load(0, true); }, [load]);
  async function toggle(u: AdminUser) {
    try { await adminSetBlocked(u.id, !u.is_blocked); setRows((prev) => prev.map((r) => (r.id === u.id ? { ...r, is_blocked: !u.is_blocked } : r))); }
    catch { setErr(true); }
  }
  return (
    <>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('adSearchName')} maxLength={60} className="mb-3 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm" />
      {err && <p role="alert" className="mb-2 text-sm text-brand-700">{t('genericError')}</p>}
      <ul className="space-y-2">
        {rows.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-sm">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{u.full_name ?? '—'} {u.blood_group ? `(${u.blood_group})` : ''}</p>
              <p className="truncate text-xs text-gray-500">{u.email ?? '—'} · {u.email_verified ? `✔ ${t('verifiedBadge')}` : t('notVerifiedBadge')}</p>
            </div>
            {canBlock && <button type="button" onClick={() => void toggle(u)} className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold ${u.is_blocked ? 'border-green-600 text-green-700' : 'border-brand-600 text-brand-600'}`}>{u.is_blocked ? t('adUnblock') : t('adBlock')}</button>}
          </li>
        ))}
      </ul>
      {loading && <p className="mt-3 text-center text-sm text-gray-500">{t('loading')}</p>}
      {!loading && rows.length === 0 && <p className="mt-6 text-center text-sm text-gray-500">{t('rqEmpty')}</p>}
      {!loading && more && <button type="button" onClick={() => void load(page + 1, false)} className="mt-3 w-full rounded-xl border border-brand-600 py-2 font-semibold text-brand-600">{t('rqLoadMore')}</button>}
    </>
  );
}

function Requests({ lang }: { lang: 'bn' | 'en' }) {
  const { t } = useLang();
  const [status, setStatus] = useState<RequestStatus | ''>('');
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const load = useCallback(async (p: number, replace: boolean) => {
    setLoading(true); setErr(false);
    try {
      const d = await adminListRequests(p, status);
      setRows((prev) => (replace ? d : [...prev, ...d])); setMore(d.length === PAGE_SIZE); setPage(p);
    } catch { setErr(true); } finally { setLoading(false); }
  }, [status]);
  useEffect(() => { void load(0, true); }, [load]);
  async function change(r: RequestRow, s: RequestStatus) {
    try { await adminSetRequestStatus(r.id, s); setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: s } : x))); }
    catch { setErr(true); }
  }
  return (
    <>
      <select aria-label={t('adStatus')} value={status} onChange={(e) => setStatus(e.target.value as RequestStatus | '')} className="mb-3 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm">
        <option value="">{t('adStatus')}: —</option>
        {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{t(STATUS_KEY[s])}</option>)}
      </select>
      {err && <p role="alert" className="mb-2 text-sm text-brand-700">{t('genericError')}</p>}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl bg-white p-3 shadow-sm">
            <Link to={`/requests/${r.id}`} className="block text-sm font-medium">{r.blood_group} · {r.hospital_name}</Link>
            <p className="text-xs text-gray-500">{r.request_code} · {fmtDateTime(r.created_at, lang)}</p>
            <select aria-label={t('adStatus')} value={r.status} onChange={(e) => void change(r, e.target.value as RequestStatus)} className="mt-2 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs">
              {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{t(STATUS_KEY[s])}</option>)}
            </select>
          </li>
        ))}
      </ul>
      {loading && <p className="mt-3 text-center text-sm text-gray-500">{t('loading')}</p>}
      {!loading && rows.length === 0 && <p className="mt-6 text-center text-sm text-gray-500">{t('rqEmpty')}</p>}
      {!loading && more && <button type="button" onClick={() => void load(page + 1, false)} className="mt-3 w-full rounded-xl border border-brand-600 py-2 font-semibold text-brand-600">{t('rqLoadMore')}</button>}
    </>
  );
}
