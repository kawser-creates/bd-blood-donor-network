import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { isProfileComplete, type Profile } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n';

type Ctx = { profile: Profile | null; loading: boolean; error: string | null; refresh: () => Promise<void> };
const ProfileCtx = createContext<Ctx | null>(null);

/** Loads the signed-in user's own profile (RLS limits this query to their own row). */
export function ProfileLayout() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const phone = session?.user.phone;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!uid) return;
    const read = () => supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    let { data, error: err } = await read();
    if (!err && !data) {
      // Row is normally created by a DB trigger at sign-up; create it if it is missing.
      await supabase.from('profiles').insert({ id: uid, phone: phone ? phone : null });
      ({ data, error: err } = await read());
    }
    if (err) setError(err.message);
    else { setProfile((data as Profile | null) ?? null); setError(null); }
    setLoading(false);
  }, [uid, phone]);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<Ctx>(() => ({ profile, loading, error, refresh }), [profile, loading, error, refresh]);
  return (
    <ProfileCtx.Provider value={value}>
      <Outlet />
    </ProfileCtx.Provider>
  );
}

export function useProfile(): Ctx {
  const ctx = useContext(ProfileCtx);
  if (!ctx) throw new Error('useProfile must be used inside ProfileLayout');
  return ctx;
}

/** Sends users with an incomplete profile to /profile. UX only; the database enforces the real rules. */
export function RequireProfile() {
  const { profile, loading, error, refresh } = useProfile();
  const { t } = useLang();
  if (loading) return <div className="p-8 text-center text-gray-500">{t('loading')}</div>;
  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-brand-700">{t('genericError')}</p>
        <button onClick={() => void refresh()} className="mt-4 rounded-xl border border-brand-600 px-4 py-2 text-brand-600">{t('retry')}</button>
      </div>
    );
  }
  if (!isProfileComplete(profile)) return <Navigate to="/profile" replace />;
  return <Outlet />;
}
