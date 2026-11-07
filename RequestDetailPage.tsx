import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useProfile } from '../profile/ProfileContext';
import { useLang } from '../i18n';
import { getDonor } from '../lib/api';
import type { DonorProfile } from '../lib/types';
import {
  closeRequest, countAccepted, dialNumber, getContacts, getMyResponse, getRequest, OPEN_STATUSES, PRIORITY_KEY,
  respondToRequest, STATUS_KEY, type Contact, type RequestDetail,
} from '../lib/requestsApi';
import { districtName, fmtDateTime, useDistricts } from '../lib/useDistricts';

export default function RequestDetailPage() {
  const { id = '' } = useParams();
  const { t, lang } = useLang();
  const { session } = useAuth();
  const { profile } = useProfile();
  const uid = session?.user.id ?? '';
  const districts = useDistricts();

  const [req, setReq] = useState<RequestDetail | null | undefined>(undefined);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [myResp, setMyResp] = useState<string | null>(null);
  const [donor, setDonor] = useState<DonorProfile | null>(null);
  const [accepted, setAccepted] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await getRequest(id);
      setReq(r);
      if (!r) return;
      const owner = r.requester_id === uid;
      const [c, mr, d, n] = await Promise.all([
        getContacts(id), owner ? Promise.resolve(null) : getMyResponse(id, uid), getDonor(uid),
        owner ? countAccepted(id) : Promise.resolve(0),
      ]);
      setContacts(c); setMyResp(mr); setDonor(d); setAccepted(n);
    } catch {
      setError(true);
      setReq(null);
    }
  }, [id, uid]);

  useEffect(() => { void load(); }, [load]);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setActionError(false);
    try { await fn(); await load(); } catch { setActionError(true); } finally { setBusy(false); setConfirmCancel(false); }
  }

  if (req === undefined) return <p className="p-8 text-center text-gray-500">{t('loading')}</p>;
  if (error || !req) {
    return (
      <main className="mx-auto max-w-md px-5 py-10 text-center">
        <p className="text-gray-600">{error ? t('genericError') : t('rqNotFound')}</p>
        <Link to="/requests" className="mt-4 inline-block text-brand-600 underline">{t('back')}</Link>
      </main>
    );
  }

  const isOwner = req.requester_id === uid;
  const open = OPEN_STATUSES.includes(req.status);
  const canRespond = !isOwner && open && !!donor && profile?.blood_group === req.blood_group;

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-brand-50 px-3 py-1 text-lg font-bold text-brand-700">{req.blood_group}</span>
          <span className="text-xs font-semibold text-brand-600">{t(PRIORITY_KEY[req.priority])}</span>
        </div>
        <p className="mt-3 text-xs text-gray-500">{t('rqCode')}: {req.request_code}</p>
        <h1 className="mt-1 text-lg font-semibold">{req.hospital_name}</h1>
        <p className="text-sm text-gray-600">{req.hospital_address}</p>
        <p className="text-sm text-gray-600">{districtName(districts, req.district_id, lang)} · {req.bags_needed} {t('rqBags')}</p>
        <p className="mt-2 text-sm">{t('rqRequiredAt')}: {fmtDateTime(req.required_at, lang)}</p>
        <p className="mt-1 text-sm font-medium">{t(STATUS_KEY[req.status])}</p>
        {req.description && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surface p-3 text-sm">{req.description}</p>}
        {isOwner && <p className="mt-3 text-xs text-gray-500">{t('rqOwnNote')}</p>}
      </section>

      {isOwner && (
        <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="font-semibold">{t('rqResponses')}: {accepted}</h2>
          <ul className="mt-3 space-y-2">
            {contacts.map((c) => (
              <li key={c.user_id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 p-3">
                <span className="text-sm">{c.full_name ?? t('roleDonor')}</span>
                {c.phone && <a href={`tel:${dialNumber(c.phone)}`} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white">📞 {t('rqCall')}</a>}
              </li>
            ))}
          </ul>
          {contacts.length === 0 && <p className="mt-2 text-sm text-gray-500">{t('rqNoContacts')}</p>}
          <p className="mt-3 text-xs text-gray-500">{t('rqContactPrivacy')}</p>
          {open && (
            <div className="mt-4 space-y-2">
              <button disabled={busy} onClick={() => void act(() => closeRequest(id, 'completed'))} className="w-full rounded-xl bg-brand-600 py-2.5 font-semibold text-white disabled:opacity-60">{t('rqMarkDone')}</button>
              {!confirmCancel ? (
                <button disabled={busy} onClick={() => setConfirmCancel(true)} className="w-full rounded-xl border border-gray-300 py-2.5 text-gray-600">{t('rqCancel')}</button>
              ) : (
                <button disabled={busy} onClick={() => void act(() => closeRequest(id, 'cancelled'))} className="w-full rounded-xl border border-brand-600 py-2.5 font-semibold text-brand-600">{t('rqConfirmCancel')}</button>
              )}
            </div>
          )}
        </section>
      )}

      {!isOwner && (
        <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
          {!open && <p className="text-sm text-gray-600">{t('rqClosed')}</p>}
          {open && !donor && <p className="text-sm text-gray-600">{t('rqNeedDonor')} <Link to="/donor" className="text-brand-600 underline">{t('goDonor')}</Link></p>}
          {open && donor && !canRespond && <p className="text-sm text-gray-600">{t('rqGroupMismatch')}</p>}
          {canRespond && (
            <>
              {myResp === 'accepted' && <p className="mb-3 text-sm text-green-700">{t('rqAccepted')}</p>}
              {myResp === 'rejected' && <p className="mb-3 text-sm text-gray-600">{t('rqDeclined')}</p>}
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => void act(() => respondToRequest(id, true))} className="flex-1 rounded-xl bg-brand-600 py-2.5 font-semibold text-white disabled:opacity-60">{t('rqAccept')}</button>
                <button disabled={busy} onClick={() => void act(() => respondToRequest(id, false))} className="flex-1 rounded-xl border border-gray-300 py-2.5 text-gray-600 disabled:opacity-60">{t('rqDecline')}</button>
              </div>
            </>
          )}
          {contacts.filter((c) => c.contact_role === 'requester').map((c) => (
            <div key={c.user_id} className="mt-4 rounded-xl border border-gray-200 p-3">
              <p className="text-sm font-medium">{t('roleRequester')}: {c.full_name ?? ''}</p>
              {c.phone && <a href={`tel:${dialNumber(c.phone)}`} className="mt-2 inline-block rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white">📞 {t('rqCall')}</a>}
            </div>
          ))}
          <p className="mt-3 text-xs text-gray-500">{t('rqContactPrivacy')}</p>
        </section>
      )}

      {actionError && <p role="alert" className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-700">{t('rqActionFailed')}</p>}
      <Link to="/requests" className="mt-6 block text-center text-sm text-gray-500 underline">{t('back')}</Link>
    </main>
  );
}
