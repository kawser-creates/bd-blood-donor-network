import { useEffect, useState } from 'react';
import { getMyLocation, saveMyLocation } from '../lib/api';
import { useLang } from '../i18n';

export function GpsLocation() {
  const { t } = useLang();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    getMyLocation().then((l) => setSaved(!!l)).catch(() => setSaved(false));
  }, []);

  function capture() {
    setMsg(null);
    if (!('geolocation' in navigator)) {
      setMsg(t('gpsUnsupported'));
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await saveMyLocation(pos.coords.latitude, pos.coords.longitude);
          setSaved(true);
          setMsg(t('gpsSaved'));
        } catch (err) {
          const text = err instanceof Error ? err.message : '';
          setMsg(text.includes('outside Bangladesh') ? t('gpsOutside') : t('saveFailed'));
        } finally {
          setBusy(false);
        }
      },
      () => { setBusy(false); setMsg(t('gpsDenied')); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <h3 className="text-sm font-semibold">{t('gpsTitle')}</h3>
      <p className="mt-1 text-xs text-gray-500">{t('gpsHint')}</p>
      <p className="mt-2 text-sm">{saved === null ? t('loading') : saved ? `📍 ${t('gpsSaved')}` : t('gpsNone')}</p>
      <button type="button" onClick={capture} disabled={busy}
        className="mt-3 w-full rounded-xl border border-brand-600 py-2.5 text-sm font-semibold text-brand-600 disabled:opacity-60">
        {busy ? t('loading') : t('gpsUse')}
      </button>
      {msg && <p role="status" className="mt-2 text-sm text-gray-700">{msg}</p>}
    </div>
  );
}
