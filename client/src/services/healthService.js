import { api } from './api.js';

function isHealthPayload(data) {
  return (
    data !== null &&
    typeof data === 'object' &&
    (data.status === 'ok' || data.status === 'degraded') &&
    typeof data.version === 'string' &&
    typeof data.environment === 'string' &&
    typeof data.uptimeSeconds === 'number' &&
    data.checks !== null &&
    typeof data.checks === 'object' &&
    typeof data.checks.database === 'string'
  );
}

export async function fetchHealth() {
  const startedAt = performance.now();
  const { data } = await api.get('/v1/health');
  const latencyMs = Math.round(performance.now() - startedAt);
  // Never trust an unexpected shape (for example an HTML error page from a proxy).
  if (!isHealthPayload(data)) throw new Error('Unexpected response from the health endpoint.');
  return { health: data, latencyMs };
}
