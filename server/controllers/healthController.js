import { SERVICE_NAME } from '../config/constants.js';

/**
 * Always answers 200 so a database outage never makes the host restart-loop the API.
 * `status: "degraded"` tells the client that something needs attention.
 */
export function createHealthController({ environment, version, getDatabaseState }) {
  return function getHealth(_req, res) {
    const database = getDatabaseState();
    res.set('Cache-Control', 'no-store');
    res.json({
      status: database === 'connected' ? 'ok' : 'degraded',
      service: SERVICE_NAME,
      version,
      environment,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: { database },
    });
  };
}
