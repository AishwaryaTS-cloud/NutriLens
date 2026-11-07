import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import LabelMark from './LabelMark.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const navClass = ({ isActive }) => `nl-nav__link${isActive ? ' is-active' : ''}`;

function LogoutButton() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleLogout() {
    setBusy(true);
    setFailed(false);
    try {
      await logout();
      navigate('/', { replace: true });
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="nl-btn nl-btn--outline nl-btn--sm" onClick={handleLogout} disabled={busy}>
        {busy ? 'Logging out…' : 'Log out'}
      </button>
      {failed && (
        <span className="nl-nav__error" role="alert">
          Couldn’t log out. Try again.
        </span>
      )}
    </>
  );
}

function AccountNav() {
  const { status, user } = useAuth();
  if (status === 'loading') return null;
  if (status === 'authenticated') {
    return (
      <>
        <NavLink to="/dashboard" className={navClass}>
          Dashboard
        </NavLink>
        <span className="nl-nav__user" title={user.email}>
          {user.name}
        </span>
        <LogoutButton />
      </>
    );
  }
  return (
    <>
      <NavLink to="/login" className={navClass}>
        Log in
      </NavLink>
      <Link to="/register" className="nl-btn nl-btn--primary nl-btn--sm">
        Create account
      </Link>
    </>
  );
}

export default function Layout() {
  return (
    <div className="nl-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="nl-header">
        <div className="nl-container nl-header__inner">
          <Link to="/" className="nl-brand">
            <LabelMark />
            <span className="nl-brand__name">NutriLens</span>
          </Link>
          <nav className="nl-nav" aria-label="Main">
            <NavLink to="/" end className={navClass}>
              Status
            </NavLink>
            {import.meta.env.DEV && (
              <NavLink to="/design-system" className={navClass}>
                Design system
              </NavLink>
            )}
            <AccountNav />
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main id="main" className="nl-main">
        <Outlet />
      </main>

      <footer className="nl-footer">
        <div className="nl-container">
          <p>NutriLens foundation build. Accounts are live; label scanning arrives in the next phases.</p>
        </div>
      </footer>
    </div>
  );
}
