export const SLOW_THRESHOLD_MS = 4000;

/**
 * Maps request state to what the UI should show.
 * 'checking' (optionally slow, e.g. a sleeping free-tier server), 'online' (optionally
 * degraded when the database is down) or 'offline'.
 */
export function deriveConnectionView({ isError, health, elapsedMs }) {
  if (health) return { kind: 'online', degraded: health.status !== 'ok' };
  if (isError) return { kind: 'offline' };
  return { kind: 'checking', slow: elapsedMs >= SLOW_THRESHOLD_MS };
}

export function formatUptime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
