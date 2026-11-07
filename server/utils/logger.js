/** Minimal JSON-lines logger. Callers must never pass secrets in `meta`. */
export function createLogger({ silent = false } = {}) {
  function write(level, message, meta = {}) {
    if (silent) return;
    const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...meta });
    if (level === 'error' || level === 'warn') console.error(line);
    else console.log(line);
  }
  return {
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  };
}
