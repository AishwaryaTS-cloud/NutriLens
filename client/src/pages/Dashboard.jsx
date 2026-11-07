import { useAuth } from '../context/AuthContext.jsx';

function memberSince(createdAt) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Protected page. Only account details for now: preferences and scanning come in later phases. */
export default function Dashboard() {
  const { user } = useAuth();
  const firstName = user.name.split(' ')[0];

  return (
    <section className="nl-container dashboard">
      <header>
        <p className="nl-eyebrow">Dashboard</p>
        <h1 className="dashboard__title">Welcome, {firstName}.</h1>
        <p className="dashboard__lead">You’re signed in. Scanning and preferences are not available yet.</p>
      </header>

      <div className="dashboard__grid">
        <section className="nl-label" aria-labelledby="account-title">
          <h2 id="account-title" className="nl-label__title">
            Your account
          </h2>
          <div className="nl-rule nl-rule--heavy" aria-hidden="true" />
          <dl className="nl-label__rows">
            <div className="nl-label__row">
              <dt>Name</dt>
              <dd>{user.name}</dd>
            </div>
            <div className="nl-label__row">
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div className="nl-label__row">
              <dt>Member since</dt>
              <dd>{memberSince(user.createdAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="dashboard__next" aria-labelledby="next-title">
          <h2 id="next-title" className="dashboard__next-title">
            Coming next
          </h2>
          <ul className="dashboard__next-list">
            <li>Your food preferences and allergens</li>
            <li>Label photo upload and reading</li>
            <li>Scores with a “Why” explanation</li>
          </ul>
        </section>
      </div>
    </section>
  );
}
