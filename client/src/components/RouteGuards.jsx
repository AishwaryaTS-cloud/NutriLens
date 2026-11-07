import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from './Icon.jsx';

function PageLoading({ label }) {
  return (
    <div className="nl-container page-loading" role="status">
      <Icon name="loader" size={24} className="nl-spin" />
      <span>{label}</span>
    </div>
  );
}

/** Pages that need a signed-in user. Sends visitors to /login and remembers where they were going. */
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoading label="Checking your session…" />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Login and register pages: signed-in users are sent on to their dashboard. */
export function GuestRoute() {
  const { status } = useAuth();
  if (status === 'loading') return <PageLoading label="Loading…" />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
