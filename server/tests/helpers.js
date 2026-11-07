import http from 'node:http';

/** Starts the app on a random local port, runs `fn(baseUrl)`, then always closes the server. */
export async function withServer(app, fn) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

/** Small HTTP client built on node:http so request headers (e.g. Origin) are fully controllable. */
export function request(baseUrl, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}${path}`, { method, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

// ---------- Phase 1: authentication test helpers ----------
import { randomUUID } from 'node:crypto';
import { createApp } from '../app.js';
import { createLogger } from '../utils/logger.js';

export const TEST_ORIGIN = 'http://localhost:5173';
export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

/** In-memory stand-in for the Mongo-backed repository, with the same unique-email behaviour. */
export function createMemoryUserRepository() {
  const users = new Map();
  return {
    users,
    async findByEmail(email) {
      return [...users.values()].find((user) => user.email === email) ?? null;
    },
    async findById(id) {
      return users.get(String(id)) ?? null;
    },
    async create({ name, email, passwordHash }) {
      if ([...users.values()].some((user) => user.email === email)) {
        throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
      }
      const user = { id: randomUUID(), name, email, passwordHash, createdAt: new Date() };
      users.set(user.id, user);
      return user;
    },
  };
}

export function makeTestApp({
  database = 'connected',
  userRepository = createMemoryUserRepository(),
  cookie = {},
  authRateLimit = { windowMs: 60_000, max: 1000 },
} = {}) {
  const app = createApp({
    clientOrigin: TEST_ORIGIN,
    environment: 'test',
    version: '0.0.0-test',
    logger: createLogger({ silent: true }),
    getDatabaseState: () => database,
    userRepository,
    authRateLimit,
    auth: {
      jwtSecret: TEST_JWT_SECRET,
      jwtExpiresInSeconds: 3600,
      bcryptRounds: 4, // fast for tests; production uses 12
      cookie: { name: 'nl_token', secure: false, sameSite: 'lax', maxAgeMs: 3_600_000, ...cookie },
    },
  });
  return { app, userRepository };
}

export function postJson(url, path, body, headers = {}) {
  return request(url, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/** Returns "name=value" for the first Set-Cookie header that sets `name`, or undefined. */
export function cookieFrom(res, name) {
  const raw = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`));
  return raw ? raw.split(';')[0] : undefined;
}

export function setCookieHeader(res, name) {
  return (res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`));
}

export const validUser = { name: 'Asha Rao', email: 'asha@example.com', password: 'Passw0rdOK' };
