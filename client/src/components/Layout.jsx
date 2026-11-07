import { NavLink, Link, Outlet } from 'react-router-dom';
import LabelMark from './LabelMark.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const navClass = ({ isActive }) => `nl-nav__link${isActive ? ' is-active' : ''}`;

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
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main id="main" className="nl-main">
        <Outlet />
      </main>

      <footer className="nl-footer">
        <div className="nl-container">
          <p>NutriLens foundation build. Sign-in and label scanning arrive in the next phases.</p>
        </div>
      </footer>
    </div>
  );
}
