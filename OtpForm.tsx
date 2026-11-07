import { useState, type FormEvent } from 'react';
import { MAX_VERIFY_ATTEMPTS, OTP_LENGTH, RESEND_SECONDS, isValidOtp, type FlowResult } from '../lib/authFlows';
import { useLang } from '../i18n';

type Props = {
  /** What the code was sent to (email address or phone number), shown to the user. */
  targetLabel: string;
  /** Seconds left before another code may be requested (from useCooldown). */
  remaining: number;
  startCooldown: (seconds: number) => void;
  onVerify: (token: string) => Promise<FlowResult>;
  onResend: () => Promise<FlowResult>;
  onChangeTarget: () => void;
  changeLabel: string;
  /** Message to show first, e.g. "code sent". */
  initialInfo?: string | null;
};

const inputClass =
  'mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-xl tracking-[0.5em] outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';

/** Code entry shared by email login, phone login and account linking. */
export function OtpForm({ targetLabel, remaining, startCooldown, onVerify, onResend, onChangeTarget, changeLabel, initialInfo }: Props) {
  const { t } = useLang();
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(initialInfo ?? null);
  const [attempts, setAttempts] = useState(0);

  const locked = attempts >= MAX_VERIFY_ATTEMPTS;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || locked) return;
    if (!isValidOtp(otp)) { setError(t('invalidOtp')); return; }
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await onVerify(otp);
    setBusy(false);
    if (res.ok) return; // parent reacts (session arrives / link completes)
    const used = attempts + 1;
    setAttempts(used);
    setOtp('');
    if (res.waitSeconds) startCooldown(res.waitSeconds);
    setError(used >= MAX_VERIFY_ATTEMPTS ? t('errTooManyAttempts') : t(res.key));
  }

  async function resend() {
    if (busy || remaining > 0) return;
    setBusy(true);
    setError(null);
    const res = await onResend();
    setBusy(false);
    if (res.ok) {
      startCooldown(RESEND_SECONDS);
      setAttempts(0);
      setOtp('');
      setInfo(t('otpSent'));
    } else {
      if (res.waitSeconds) startCooldown(res.waitSeconds);
      setInfo(null);
      setError(t(res.key));
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
      <p className="text-sm text-gray-600">
        {t('otpSentTo')} <span className="font-medium break-all">{targetLabel}</span>
      </p>
      <label className="block text-sm font-medium">
        {t('otpLabel')}
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          value={otp}
          disabled={locked}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          aria-label={t('otpLabel')}
          className={inputClass}
        />
      </label>
      <button disabled={busy || locked} className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-60">
        {busy ? t('loading') : t('verify')}
      </button>
      <div className="flex items-center justify-between gap-3 text-sm">
        <button type="button" onClick={onChangeTarget} className="text-gray-500 underline">{changeLabel}</button>
        <button type="button" disabled={remaining > 0 || busy} onClick={() => void resend()} className="text-brand-600 disabled:text-gray-400">
          {remaining > 0 ? `${t('resendIn')} (${remaining})` : t('resend')}
        </button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700">{error}</p>}
      {info && !error && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{info}</p>}
    </form>
  );
}
