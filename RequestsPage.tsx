import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n';
import { BLOOD_GROUPS, type BloodGroup } from '../lib/types';
import { listMyRequests, listOpenRequests, PAGE_SIZE, PRIORITY_KEY, STATUS_KEY, type RequestRow } from '../lib/requestsApi';
import { districtName, fmtDateTime, useDistricts } from '../lib/useDistricts';

const selectClass = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-600';

export default function RequestsPage() {
  const { t, lang } = useLang();
  const { session } = useAuth();
  const uid = session?.user.id ?? '';
  const districts = useDistricts();
  const [tab, setTab] = useState<'open' | 'mine'>('open');
  const [bg, setBg] = useState<BloodGroup | ''>('');
  const [district, setDistrict] = useState<number | null>(null);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (p: number, replace: boolean) => {
    setLoading(true);
    setError(false);
    try {
      const data = tab === 'open'
        ? await listOpenRequests({ bloodGroup: bg, districtId: district, page: p })
        : await listMyRequests(uid, p);
      setRows((prev) => (replace ? data : [...prev, ...data]));
      setMore(data.length === PAGE_SIZE);
      setPage(p);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [tab, bg, district, uid]);

  useEffect(() => { void load(0, true); }, [load]);

  const tabClass = (on: boolean) => `flex-1 rounded-lg py-2 text-sm font-semibold ${on ? 'bg-brand-600 text-white' : 'bg-white text-gray-600'}`;

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand-700">{t('rqTitle')}</h1>
        <Link to="/requests/new" className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white">{t('rqNew')}</Link>
      </header>

      <div className="mb-3 flex gap-2">
        <button type="button" className={tabClass(tab === 'open')} onClick={() => setTab('open')}>{t('rqTabOpen')}</button>
        <button type="button" className={tabClass(tab === 'mine')} onClick={() => setTab('mine')}>{t('rqTabMine')}</button>
      </div>

      {tab === 'open' && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <select aria-label={t('bloodGroup')} value={bg} onChange={(e) => setBg(e.target.value as BloodGroup | '')} className={selectClass}>
            <option value="">{t('rqFilterGroup')}</option>
            {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select aria-label={t('district')} value={district ?? ''} onChange={(e) => setDistrict(e.target.value ? Number(e.target.value) : null)} className={selectClass}>
            <option value="">{t('rqFilterDistrict')}</option>
            {districts.map((d) => <option key={d.id} value={d.id}>{lang === 'bn' ? d.name_bn : d.name_en}</option>)}
          </select>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl bg-brand-50 p-4 text-center text-sm text-brand-700">
          <p>{t('genericError')}</p>
          <button type="button" onClick={() => void load(0, true)} className="mt-2 font-semibold underline">{t('retry')}</button>
        </div>
      )}

      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id}>
            <Link to={`/requests/${r.id}`} className="block rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-bold text-brand-700">{r.blood_group}</span>
                <span className={`text-xs font-semibold ${r.priority === 'critical' ? 'text-brand-600' : 'text-gray-500'}`}>{t(PRIORITY_KEY[r.priority])}</span>
              </div>
              <p className="mt-2 font-medium">{r.hospital_name}</p>
              <p className="text-sm text-gray-500">{districtName(districts, r.district_id, lang)} · {r.bags_needed} {t('rqBags')}</p>
              <p className="mt-1 text-xs text-gray-500">{t('rqRequiredAt')}: {fmtDateTime(r.required_at, lang)}</p>
              <p className="mt-1 text-xs text-gray-400">{t(STATUS_KEY[r.status])}</p>
            </Link>
          </li>
        ))}
      </ul>

      {loading && <p className="mt-4 text-center text-sm text-gray-500">{t('loading')}</p>}
      {!loading && !error && rows.length === 0 && <p className="mt-8 text-center text-sm text-gray-500">{t('rqEmpty')}</p>}
      {!loading && more && (
        <button type="button" onClick={() => void load(page + 1, false)} className="mt-4 w-full rounded-xl border border-brand-600 py-2.5 font-semibold text-brand-600">{t('rqLoadMore')}</button>
      )}
      <Link to="/" className="mt-6 block text-center text-sm text-gray-500 underline">{t('back')}</Link>
    </main>
  );
}
