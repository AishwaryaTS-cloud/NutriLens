import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from './Icon.jsx';
import LabelMark from './LabelMark.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const navClass = ({ isActive }) => `nl-nav__link${isActive ? ' is-active' : ''}`;

const APP_LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: 'home' },
  { to: '/scan', label: 'Scan Product', icon: 'scan' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/compare', label: 'Compare Products', icon: 'compare' },
  { to: '/preferences', label: 'Profile', icon: 'user' },
];

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'N';
}

function LogoutButton({ className = 'nl-btn nl-btn--outline nl-btn--sm' }) {
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
      <button type="button" className={className} onClick={handleLogout} disabled={busy}>
        {busy ? 'Logging out…' : 'Log out'}
      </button>
      {failed && <span className="nl-nav__error" role="alert">Couldn’t log out. Try again.</span>}
    </>
  );
}

export default function Layout() {
  const { status, user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const signedIn = status === 'authenticated';
  const onLanding = location.pathname === '/';

  // Close the mobile menu after navigating, and on Escape.
  useEffect(() => setOpen(false), [location.pathname, location.hash]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="nl-shell">
      <a className="skip-link" href="#main">Skip to content</a>

      <header className="nl-header">
        <div className="nl-container nl-header__inner">
          <Link to={signedIn ? '/dashboard' : '/'} className="nl-brand" aria-label="NutriLens home">
            <LabelMark />
            <span className="nl-brand__name">NutriLens</span>
          </Link>

          <nav className={`nl-nav${open ? ' is-open' : ''}`} id="site-nav" aria-label="Main">
            {signedIn && APP_LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className={navClass}>
                <Icon name={l.icon} size={18} className="nl-nav__icon" />
                {l.label}
              </NavLink>
            ))}
            {!signedIn && status !== 'loading' && onLanding && (
              <>
                <a className="nl-nav__link" href="#features">Features</a>
                <a className="nl-nav__link" href="#how-it-works">How it works</a>
                <a className="nl-nav__link" href="#analysis">What you get</a>
              </>
            )}
            <div className="nl-nav__actions">
              {signedIn && <span className="nl-avatar" title={user.email} aria-label={`Signed in as ${user.name}`}>{initials(user.name)}</span>}
              <ThemeToggle />
              {signedIn && <LogoutButton />}
              {!signedIn && status !== 'loading' && (
                <>
                  <NavLink to="/login" className={navClass}>Log in</NavLink>
                  <Link to="/register" className="nl-btn nl-btn--primary nl-btn--sm">Get started</Link>
                </>
              )}
            </div>
          </nav>

          <button
            type="button"
            className="nl-menu-btn"
            aria-expanded={open}
            aria-controls="site-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? 'close' : 'menu'} size={22} />
          </button>
        </div>
      </header>

      <main id="main" className="nl-main">
        <Outlet />
      </main>

      <footer className="nl-footer">
        <div className="nl-container nl-footer__inner">
          <div className="nl-footer__brand">
            <span className="nl-brand__name">NutriLens</span>
            <p>See what’s really on the label. Understand nutrition, discover ingredients, make better food choices.</p>
          </div>
          <nav className="nl-footer__links" aria-label="Footer">
            {signedIn ? (
              <>
                <Link to="/scan">Scan Product</Link>
                <Link to="/history">History</Link>
                <Link to="/compare">Compare Products</Link>
                <Link to="/preferences">Profile</Link>
              </>
            ) : (
              <>
                <Link to="/register">Create account</Link>
                <Link to="/login">Log in</Link>
              </>
            )}
          </nav>
          <p className="nl-footer__note">
            NutriLens is an informational tool, not medical advice. Always check the printed label if you have an allergy.
          </p>
        </div>
      </footer>
    </div>
  );
}
