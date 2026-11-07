const NODE_ENVS = ['development', 'test', 'production'];
const SAME_SITE_VALUES = ['lax', 'strict', 'none'];
const SECONDS_PER_UNIT = { m: 60, h: 3600, d: 86400 };

export class EnvValidationError extends Error {
  constructor(issues) {
    super(`Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

function parsePort(raw, issues) {
  if (raw === undefined || raw === '') return 4000;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    issues.push('PORT: must be an integer between 1 and 65535');
    return undefined;
  }
  return port;
}

function parseMongoUri(raw, issues) {
  if (!raw) {
    issues.push('MONGODB_URI: is required');
    return undefined;
  }
  if (!/^mongodb(\+srv)?:\/\//.test(raw)) {
    // The message never echoes the value: connection strings contain passwords.
    issues.push('MONGODB_URI: must start with mongodb:// or mongodb+srv://');
    return undefined;
  }
  return raw;
}

function parseOrigin(raw, issues) {
  const value = raw || 'http://localhost:5173';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
    return url.origin;
  } catch {
    issues.push('CLIENT_ORIGIN: must be a valid http(s) URL');
    return undefined;
  }
}

function parseJwtSecret(raw, issues) {
  if (!raw) {
    issues.push('JWT_SECRET: is required (at least 32 random characters)');
    return undefined;
  }
  if (raw.length < 32) {
    issues.push('JWT_SECRET: must be at least 32 characters');
    return undefined;
  }
  if (/^replace-with/i.test(raw)) {
    issues.push('JWT_SECRET: is still the .env.example placeholder; generate a random value');
    return undefined;
  }
  return raw;
}

/** "7d", "12h" or "30m" -> seconds. */
function parseJwtExpiry(raw, issues) {
  const match = /^(\d+)([mhd])$/.exec(raw || '7d');
  if (!match || Number(match[1]) === 0) {
    issues.push('JWT_EXPIRES_IN: use a number followed by m, h or d (for example 7d)');
    return undefined;
  }
  return Number(match[1]) * SECONDS_PER_UNIT[match[2]];
}

function parseBoolean(raw, fallback, name, issues) {
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  issues.push(`${name}: must be true or false`);
  return undefined;
}

/** Validates configuration. Pure: takes a plain object so it is easy to test. */
export function parseEnv(source) {
  const issues = [];

  const nodeEnv = source.NODE_ENV || 'development';
  if (!NODE_ENVS.includes(nodeEnv)) {
    issues.push(`NODE_ENV: must be one of ${NODE_ENVS.join(', ')}`);
  }
  const port = parsePort(source.PORT, issues);
  const mongoUri = parseMongoUri(source.MONGODB_URI, issues);
  const clientOrigin = parseOrigin(source.CLIENT_ORIGIN, issues);

  const jwtSecret = parseJwtSecret(source.JWT_SECRET, issues);
  const jwtExpiresInSeconds = parseJwtExpiry(source.JWT_EXPIRES_IN, issues);

  const cookieSecure = parseBoolean(source.COOKIE_SECURE, nodeEnv === 'production', 'COOKIE_SECURE', issues);
  const cookieSameSite = source.COOKIE_SAME_SITE || 'lax';
  if (!SAME_SITE_VALUES.includes(cookieSameSite)) {
    issues.push(`COOKIE_SAME_SITE: must be one of ${SAME_SITE_VALUES.join(', ')}`);
  } else if (cookieSameSite === 'none' && cookieSecure === false) {
    issues.push('COOKIE_SAME_SITE=none requires COOKIE_SECURE=true');
  }

  if (issues.length > 0) throw new EnvValidationError(issues);
  return Object.freeze({
    nodeEnv,
    port,
    mongoUri,
    clientOrigin,
    jwtSecret,
    jwtExpiresInSeconds,
    cookieSecure,
    cookieSameSite,
  });
}
