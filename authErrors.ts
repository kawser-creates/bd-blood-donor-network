import type { MessageKey } from '../messages';

/** The subset of a Supabase AuthError that we look at. */
export type AuthErrorLike = { message?: string; code?: string; status?: number; name?: string } | null | undefined;

export type ErrorContext = 'send' | 'verify';

/** Translates a Supabase Auth error into one of our own (bn/en) messages. Never shows raw provider text. */
export function authErrorKey(err: AuthErrorLike, ctx: ErrorContext): MessageKey {
  if (!err) return 'genericError';
  const code = (err.code ?? '').toLowerCase();
  const msg = (err.message ?? '').toLowerCase();
  const status = err.status;

  if (
    code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' ||
    status === 429 || /rate limit|too many requests|security purposes/.test(msg)
  ) return 'errRateLimit';

  if (code === 'otp_expired' || (ctx === 'verify' && /expired|invalid|incorrect/.test(msg))) return 'errOtpExpired';
  if (code === 'email_address_invalid') return 'invalidEmail';
  if (code === 'validation_failed') return ctx === 'verify' ? 'errOtpExpired' : 'invalidEmail';
  if (code === 'email_provider_disabled' || code === 'otp_disabled' || code === 'signup_disabled') return 'errMethodDisabled';
  if (code === 'user_banned') return 'errBlockedAccount';
  if (code === 'unexpected_failure' && ctx === 'send') return 'errSendFailed';
  if (err.name === 'AuthRetryableFetchError' || status === 0 || /failed to fetch|network/.test(msg)) return 'errNetwork';
  return 'genericError';
}

/** Seconds to wait before another send when the server told us we are rate limited. */
export const RATE_LIMIT_WAIT_SECONDS = 60;
