import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { authErrorKey, RATE_LIMIT_WAIT_SECONDS } from '../src/lib/authErrors';
import { normalizeEmail } from '../src/lib/email';
import { normalizeBdPhone } from '../src/lib/phone';
import { isValidOtp, normalizeTarget, sendLoginOtp, verifyLoginOtp, type AuthApi } from '../src/lib/authFlows';
import { cooldownKey, cooldownRemaining, startCooldownFor } from '../src/lib/useCooldown';
import { PRIORITY_KEY, STATUS_KEY, dialNumber } from '../src/lib/requestsMeta';
import { dict } from '../src/messages';

type Call = { fn: string; args: unknown };

/** Records every call and answers with the next queued error (or success). */
function fakeApi(errors: Array<{ code?: string; message?: string; status?: number } | null> = []) {
  const calls: Call[] = [];
  const answer = (fn: string) => async (args: unknown) => {
    calls.push({ fn, args });
    return { error: errors.shift() ?? null };
  };
  const api: AuthApi = { signInWithOtp: answer('signInWithOtp'), verifyOtp: answer('verifyOtp') };
  return { api, calls };
}

const srcFiles = (): string[] => {
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) && files.push(p); } };
  walk(join(__dirname, '..', 'src'));
  return files;
};

describe('email validation', () => {
  it('normalizes and accepts plausible addresses', () => {
    expect(normalizeEmail('  Test@Example.COM ')).toBe('test@example.com');
    expect(normalizeEmail('a.b+tag@sub.example.co')).toBe('a.b+tag@sub.example.co');
  });
  it('rejects malformed addresses', () => {
    for (const bad of ['', 'abc', 'a@b', 'a@b.c', '@x.com', 'a b@x.com', 'a..b@x.com', '.a@x.com', 'a@-x.com', 'a@x..com', 'x'.repeat(65) + '@x.com'])
      expect(normalizeEmail(bad)).toBeNull();
  });
});

describe('Bangladesh contact phone validation (contact detail only, never verified)', () => {
  it('accepts local, +880 and Bangla-digit forms', () => {
    for (const ok of ['01712345678', '+8801712345678', '8801712345678', '০১৭১২৩৪৫৬৭৮', '017 1234-5678'])
      expect(normalizeBdPhone(ok)).toBe('+8801712345678');
  });
  it('rejects invalid numbers', () => {
    for (const bad of ['', '1712345678', '0171234567', '01212345678', '+9101712345678', 'abc']) expect(normalizeBdPhone(bad)).toBeNull();
  });
  it('builds a dialable number from stored formats', () => {
    expect(dialNumber('8801712345678')).toBe('+8801712345678');
    expect(dialNumber('+8801712345678')).toBe('+8801712345678');
    expect(dialNumber('01712345678')).toBe('01712345678');
  });
});

describe('auth error mapping', () => {
  const key = authErrorKey;
  it('maps rate limits (by code, status and message)', () => {
    expect(key({ code: 'over_email_send_rate_limit' }, 'send')).toBe('errRateLimit');
    expect(key({ status: 429 }, 'send')).toBe('errRateLimit');
    expect(key({ message: 'For security purposes, you can only request this after 59 seconds.' }, 'send')).toBe('errRateLimit');
  });
  it('maps expired / invalid / reused codes', () => {
    expect(key({ code: 'otp_expired' }, 'verify')).toBe('errOtpExpired');
    expect(key({ message: 'Token has expired or is invalid' }, 'verify')).toBe('errOtpExpired');
    expect(key({ code: 'validation_failed' }, 'verify')).toBe('errOtpExpired');
  });
  it('maps provider, network and unknown failures without leaking provider text', () => {
    expect(key({ code: 'email_address_invalid' }, 'send')).toBe('invalidEmail');
    expect(key({ code: 'email_provider_disabled' }, 'send')).toBe('errMethodDisabled');
    expect(key({ code: 'user_banned' }, 'verify')).toBe('errBlockedAccount');
    expect(key({ code: 'unexpected_failure', message: 'smtp secret' }, 'send')).toBe('errSendFailed');
    expect(key({ name: 'AuthRetryableFetchError', message: 'x' }, 'send')).toBe('errNetwork');
    expect(key({ message: 'weird' }, 'send')).toBe('genericError');
    expect(key(null, 'send')).toBe('genericError');
  });
  it('only ever returns keys that exist in both languages', () => {
    const samples = [{ code: 'over_email_send_rate_limit' }, { code: 'otp_expired' }, { code: 'user_banned' }, { status: 0 }, { code: 'email_address_invalid' }, null];
    for (const s of samples) for (const ctx of ['send', 'verify'] as const) {
      const k = key(s, ctx);
      expect(k in dict.bn).toBe(true);
      expect(k in dict.en).toBe(true);
    }
  });
});

describe('email OTP login flow', () => {
  it('normalizes, sends a code to the email, allows sign-up', async () => {
    const { api, calls } = fakeApi();
    const t = normalizeTarget(' Me@Example.com ')!;
    expect(await sendLoginOtp(api, t)).toEqual({ ok: true });
    expect(calls).toEqual([{ fn: 'signInWithOtp', args: { email: 'me@example.com', options: { shouldCreateUser: true } } }]);
  });
  it('never calls Supabase for an invalid email', async () => {
    const { api, calls } = fakeApi();
    expect(normalizeTarget('01712345678')).toBeNull();
    expect(await sendLoginOtp(api, { kind: 'email', value: 'nope' })).toEqual({ ok: false, key: 'invalidEmail' });
    expect(calls).toHaveLength(0);
  });
  it('verify uses type "email" and rejects malformed codes locally', async () => {
    const { api, calls } = fakeApi();
    expect(await verifyLoginOtp(api, { kind: 'email', value: 'a@b.co' }, '12345')).toEqual({ ok: false, key: 'invalidOtp' });
    expect(await verifyLoginOtp(api, { kind: 'email', value: 'a@b.co' }, 'abcdef')).toEqual({ ok: false, key: 'invalidOtp' });
    expect(calls).toHaveLength(0);
    await verifyLoginOtp(api, { kind: 'email', value: 'a@b.co' }, '123456');
    expect(calls).toEqual([{ fn: 'verifyOtp', args: { email: 'a@b.co', token: '123456', type: 'email' } }]);
  });
  it('expired / reused / wrong code → friendly key', async () => {
    const { api } = fakeApi([{ code: 'otp_expired', message: 'Token has expired or is invalid', status: 403 }]);
    expect(await verifyLoginOtp(api, { kind: 'email', value: 'a@b.co' }, '123456')).toEqual({ ok: false, key: 'errOtpExpired' });
  });
  it('rate limit carries a wait time for the countdown', async () => {
    const { api } = fakeApi([{ code: 'over_email_send_rate_limit', status: 429 }]);
    expect(await sendLoginOtp(api, normalizeTarget('a@b.co')!)).toEqual({ ok: false, key: 'errRateLimit', waitSeconds: RATE_LIMIT_WAIT_SECONDS });
  });
  it('OTP format check (six digits)', () => {
    expect(isValidOtp('123456')).toBe(true);
    for (const bad of ['', '12345', '1234567', '12 456', 'abcdef']) expect(isValidOtp(bad)).toBe(false);
  });
});

describe('resend cooldown helpers', () => {
  const store = new Map<string, string>();
  (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
  };
  it('counts down per target and keeps targets separate', () => {
    const a = cooldownKey('email', 'a@b.co'), b = cooldownKey('email', 'c@d.co');
    expect(cooldownRemaining(a)).toBe(0);
    startCooldownFor(a, 60);
    expect(cooldownRemaining(a)).toBeGreaterThan(55);
    expect(cooldownRemaining(a)).toBeLessThanOrEqual(60);
    expect(cooldownRemaining(b)).toBe(0);
    expect(cooldownRemaining(null)).toBe(0);
  });
  it('survives storage being unavailable', () => {
    (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    expect(() => startCooldownFor('k', 60)).not.toThrow();
    expect(cooldownRemaining('k')).toBe(0);
  });
});

describe('SMS authentication is gone', () => {
  it('no source file calls phone/SMS OTP APIs or mentions SMS auth', () => {
    const bad = /type:\s*['"](sms|phone_change)['"]|signInWithOtp\(\{\s*phone|\bsms\b|phone_exists|phone_confirmed/i;
    const offenders = srcFiles().filter((f) => bad.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
  it('no SMS strings in translations', () => {
    expect(JSON.stringify(dict)).toBe(JSON.stringify(dict).replace(/\bSMS\b/g, 'SMS'));
    expect(/\bSMS\b/i.test(JSON.stringify(dict))).toBe(false);
  });
});

describe('request labels', () => {
  it('every priority and status label key exists in both languages', () => {
    for (const k of [...Object.values(PRIORITY_KEY), ...Object.values(STATUS_KEY)]) {
      expect(k in dict.bn).toBe(true);
      expect(k in dict.en).toBe(true);
    }
  });
});

describe('translations (bn + en)', () => {
  it('both languages define exactly the same keys', () => {
    expect(Object.keys(dict.bn).sort()).toEqual(Object.keys(dict.en).sort());
  });
  it('no empty strings', () => {
    for (const lang of ['bn', 'en'] as const) for (const [k, v] of Object.entries(dict[lang])) expect(`${k}:${String(v).trim().length > 0}`).toBe(`${k}:true`);
  });
  it('every literal t("key") used in src (including ternaries) exists', () => {
    const used = new Set<string>();
    for (const f of srcFiles().filter((x) => !x.endsWith('messages.ts')))
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(((?:[^()]|\([^()]*\))*)\)/g))
        for (const k of m[1].matchAll(/'([A-Za-z][A-Za-z0-9_]*)'/g)) used.add(k[1]);
    const missing = [...used].filter((k) => !(k in dict.bn) || !(k in dict.en));
    expect(missing).toEqual([]);
  });
  it('every MessageKey passed to setError()/setGpsMsg() literal exists', () => {
    const used = new Set<string>();
    for (const f of srcFiles().filter((x) => !x.endsWith('messages.ts')))
      for (const m of readFileSync(f, 'utf8').matchAll(/(?:setError|setGpsMsg|return setError)\(\s*'([A-Za-z0-9_]+)'/g)) used.add(m[1]);
    expect([...used].filter((k) => !(k in dict.bn))).toEqual([]);
  });
});
