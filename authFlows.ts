import type { MessageKey } from '../messages';
import { authErrorKey, RATE_LIMIT_WAIT_SECONDS, type AuthErrorLike } from './authErrors';
import { normalizeEmail } from './email';

/** A sign-in target. Email only: the app uses passwordless Email OTP and nothing else. */
export type Target = { kind: 'email'; value: string };

export type FlowResult =
  | { ok: true }
  | { ok: false; key: MessageKey; waitSeconds?: number };

type ApiResult = { error: AuthErrorLike };

/** The two Supabase Auth calls we use, in a shape that is easy to fake in tests. */
export interface AuthApi {
  signInWithOtp(args: { email: string; options?: { shouldCreateUser?: boolean } }): Promise<ApiResult>;
  verifyOtp(args: { email: string; token: string; type: 'email' }): Promise<ApiResult>;
}

export const RESEND_SECONDS = 60;
export const OTP_LENGTH = 6;
export const MAX_VERIFY_ATTEMPTS = 5;

export function normalizeTarget(raw: string): Target | null {
  const value = normalizeEmail(raw);
  return value ? { kind: 'email', value } : null;
}

export function isValidOtp(token: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(token);
}

function fail(err: AuthErrorLike, ctx: 'send' | 'verify'): FlowResult {
  const key = authErrorKey(err, ctx);
  return key === 'errRateLimit' ? { ok: false, key, waitSeconds: RATE_LIMIT_WAIT_SECONDS } : { ok: false, key };
}

/** Sends a 6-digit login code by email. New users are created on first verification. */
export async function sendLoginOtp(api: AuthApi, target: Target): Promise<FlowResult> {
  const email = normalizeEmail(target.value);
  if (!email) return { ok: false, key: 'invalidEmail' };
  const { error } = await api.signInWithOtp({ email, options: { shouldCreateUser: true } });
  return error ? fail(error, 'send') : { ok: true };
}

/** Verifies the code. On success Supabase issues a session; AuthProvider picks it up. */
export async function verifyLoginOtp(api: AuthApi, target: Target, token: string): Promise<FlowResult> {
  if (!isValidOtp(token)) return { ok: false, key: 'invalidOtp' };
  const { error } = await api.verifyOtp({ email: target.value, token, type: 'email' });
  return error ? fail(error, 'verify') : { ok: true };
}
