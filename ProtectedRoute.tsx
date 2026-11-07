import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useLang } from '../i18n';

/** UX guard only. Real access control is enforced by Supabase RLS on the server. */
export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const { t } = useLang();
  if (loading) return <div className="p-8 text-center text-gray-500">{t('loading')}</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}
