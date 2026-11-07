import { useCallback, useEffect, useState } from 'react';

/**
 * Resend cooldown that survives page refreshes (sessionStorage), so reloading the page does not
 * bypass the wait. It is a UX guard; Supabase enforces its own server-side limits.
 */
const PREFIX = 'otp-cooldown:';

function readUntil(key: string | null): number {
  if (!key) return 0;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** Starts (or restarts) the cooldown for a key, without needing a mounted component. */
export function startCooldownFor(key: string | null, seconds: number): number {
  const until = Date.now() + seconds * 1000;
  if (key) {
    try { sessionStorage.setItem(PREFIX + key, String(until)); } catch { /* storage unavailable */ }
  }
  return until;
}

/** Whole seconds left on the cooldown for this key (0 when none). */
export function cooldownRemaining(key: string | null): number {
  return Math.max(0, Math.ceil((readUntil(key) - Date.now()) / 1000));
}

export function cooldownKey(kind: string, value: string): string {
  return `${kind}:${value}`;
}

export function useCooldown(key: string | null) {
  const [state, setState] = useState<{ key: string | null; until: number }>(() => ({ key, until: readUntil(key) }));
  const [now, setNow] = useState<number>(() => Date.now());

  // Re-read when the target changes (adjusting state during render avoids a one-frame flash).
  if (state.key !== key) setState({ key, until: readUntil(key) });
  // Always also consult storage: a cooldown can be started by startCooldownFor() AFTER the key was set
  // (the login form sets the target first, then sends the code). Using only `state` would miss it and
  // leave "Resend" enabled right after the first send.
  const until = Math.max(state.key === key ? state.until : 0, readUntil(key));

  useEffect(() => {
    if (until <= Date.now()) return;
    setNow(Date.now());
    const id = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) window.clearInterval(id);
    }, 500);
    return () => window.clearInterval(id);
  }, [until]);

  const start = useCallback((seconds: number) => {
    const u = startCooldownFor(key, seconds);
    setState({ key, until: u });
    setNow(Date.now());
  }, [key]);

  return { remaining: Math.max(0, Math.ceil((until - now) / 1000)), start };
}
