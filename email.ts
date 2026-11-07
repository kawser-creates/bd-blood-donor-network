const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Trims and lowercases an email. Returns null when it is not a plausible address. */
export function normalizeEmail(input: string): string | null {
  const e = input.trim().toLowerCase();
  if (e.length < 6 || e.length > 254 || !EMAIL_RE.test(e)) return null;
  const [local, domain] = e.split('@');
  if (!local || !domain || local.length > 64) return null;
  if (e.includes('..') || local.startsWith('.') || local.endsWith('.')) return null;
  if (domain.startsWith('.') || domain.startsWith('-') || domain.endsWith('.') || domain.endsWith('-')) return null;
  return e;
}
