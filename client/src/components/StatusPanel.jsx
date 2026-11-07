import { formatUptime } from '../hooks/healthView.js';
import Icon from './Icon.jsx';

function summarize(view) {
  if (view.kind === 'checking') {
    return {
      tone: 'pending',
      icon: 'loader',
      title: view.slow ? 'The server is waking up' : 'Contacting the server',
      detail: view.slow
        ? 'Free hosting sleeps when idle, so the first request can take up to a minute.'
        : 'This usually takes a moment.',
    };
  }
  if (view.kind === 'offline') {
    return {
      tone: 'error',
      icon: 'x',
      title: 'The server can’t be reached',
      detail: 'If you are running locally, check that the API is running on port 4000.',
    };
  }
  if (view.degraded) {
    return {
      tone: 'warn',
      icon: 'alert',
      title: 'Connected, but the database is down',
      detail: 'Check MONGODB_URI in your .env file and restart the API.',
    };
  }
  return {
    tone: 'ok',
    icon: 'check',
    title: 'Everything is connected',
    detail: 'The web app, the API and the database are talking to each other.',
  };
}

function Row({ label, value }) {
  return (
    <div className="nl-label__row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function databaseText(health) {
  if (!health) return 'Unknown';
  return health.checks.database === 'connected' ? 'Connected' : 'Not connected';
}

/** Styled after the heavy-ruled panel of a printed nutrition label. */
export default function StatusPanel({ view, health, latencyMs }) {
  const summary = summarize(view);
  const apiText = view.kind === 'online' ? 'Online' : view.kind === 'offline' ? 'Unreachable' : 'Connecting';

  return (
    <section className="nl-label" aria-labelledby="status-title">
      <h2 id="status-title" className="nl-label__title">
        System status
      </h2>
      <div className="nl-rule nl-rule--heavy" aria-hidden="true" />

      <div className={`nl-status nl-status--${summary.tone}`} role="status">
        <Icon name={summary.icon} size={22} className={summary.tone === 'pending' ? 'nl-spin' : ''} />
        <div>
          <p className="nl-status__title">{summary.title}</p>
          <p className="nl-status__detail">{summary.detail}</p>
        </div>
      </div>

      <div className="nl-rule nl-rule--medium" aria-hidden="true" />
      <dl className="nl-label__rows">
        <Row label="Web app" value="Running" />
        <Row label="API" value={apiText} />
        <Row label="Database" value={databaseText(health)} />
      </dl>

      <div className="nl-rule nl-rule--medium" aria-hidden="true" />
      <dl className="nl-label__rows">
        <Row label="Version" value={health?.version ?? '—'} />
        <Row label="Environment" value={health?.environment ?? '—'} />
        <Row label="Server uptime" value={health ? formatUptime(health.uptimeSeconds) : '—'} />
        <Row label="Response time" value={latencyMs === undefined ? '—' : `${latencyMs} ms`} />
      </dl>
    </section>
  );
}
