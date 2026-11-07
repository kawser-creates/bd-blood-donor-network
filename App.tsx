import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LanguageProvider } from './i18n';
import { ProfileLayout, RequireProfile } from './profile/ProfileContext';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import DonorPage from './pages/DonorPage';
import RequestsPage from './pages/RequestsPage';
import RequestNewPage from './pages/RequestNewPage';
import RequestDetailPage from './pages/RequestDetailPage';
import DonorSearchPage from './pages/DonorSearchPage';
import AdminPage from './pages/AdminPage';

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<ProfileLayout />}>
                <Route path="/profile" element={<ProfilePage />} />
                <Route element={<RequireProfile />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/donor" element={<DonorPage />} />
                  <Route path="/donors" element={<DonorSearchPage />} />
                  <Route path="/requests" element={<RequestsPage />} />
                  <Route path="/requests/new" element={<RequestNewPage />} />
                  <Route path="/requests/:id" element={<RequestDetailPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}
