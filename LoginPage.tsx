import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { authApi } from '../lib/authApi';
import { normalizeTarget, RESEND_SECONDS, sendLoginOtp, verifyLoginOtp, type Target } from '../lib/authFlows';
import { cooldownKey, cooldownRemaining, startCooldownFor, useCooldown } from '../lib/useCooldown';
import { OtpForm } from '../components/OtpForm';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n';

const inputClass =
  'mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';

export default function LoginPage() {
  const { session, loading } = useAuth();
  const { t, lang, setLang } = useLang();

  const [step, setStep] = useState<'input' | 'otp'>('input');
  const [raw, setRaw] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const cd = useCooldown(target ? cooldownKey(target.kind, target.value) : null);

  if (!loading && session) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const tg = normalizeTarget(raw);
    if (!tg) { setError(t('invalidEmail')); return; }
    setError(null);
    setTarget(tg);

    // A code was sent to this address a moment ago: do not send another, just ask for it.
    const key = cooldownKey(tg.kind, tg.value);
    if (cooldownRemaining(key) > 0) {
      setInfo(t('codeAlreadySent'));
      setStep('otp');
      return;
    }

    setBusy(true);
    const res = await sendLoginOtp(authApi, tg);
    setBusy(false);
    if (!res.ok) { setError(t(res.key)); return; }
    startCooldownFor(key, RESEND_SECONDS);
    setInfo(t('otpSent'));
    setStep('otp');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <button
        type="button"
        onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
        className="mb-6 self-end rounded-full bg-white px-3 py-1 text-sm text-gray-600 shadow-sm"
      >
        {t('language')}
      </button>

      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-3xl text-white">🩸</div>
        <h1 className="text-xl font-bold text-brand-700">{t('appName')}</h1>
      </div>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t('emailLoginTitle')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t('emailLoginHint')}</p>

        {step === 'input' || !target ? (
          <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
            <label className="block text-sm font-medium">
              {t('emailAddressLabel')}
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={raw}
                maxLength={254}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={t('emailPlaceholder')}
                className={inputClass}
              />
            </label>
            <button disabled={busy} className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-60">
              {busy ? t('loading') : t('sendOtp')}
            </button>
          </form>
        ) : (
          <OtpForm
            key={target.value}
            targetLabel={target.value}
            remaining={cd.remaining}
            startCooldown={cd.start}
            initialInfo={info}
            changeLabel={t('changeEmail')}
            onChangeTarget={() => { setStep('input'); setError(null); setInfo(null); }}
            onVerify={(token) => verifyLoginOtp(authApi, target, token)}
            onResend={() => sendLoginOtp(authApi, target)}
          />
        )}
        {step === 'input' && error && <p role="alert" className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-700">{error}</p>}
      </section>
    </main>
  );
}
