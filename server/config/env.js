const NODE_ENVS = ['development', 'test', 'production'];

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

  if (issues.length > 0) throw new EnvValidationError(issues);
  return Object.freeze({ nodeEnv, port, mongoUri, clientOrigin });
}
