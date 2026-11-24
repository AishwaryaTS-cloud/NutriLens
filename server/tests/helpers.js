import http from 'node:http';

/** Starts the app on a random local port, runs `fn(baseUrl)`, then always closes the server. */
const mailers = new Map(); // base URL -> the fake mailer of the app served there (see signUp)

export async function withServer(app, fn) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  if (app.locals.testMailer) mailers.set(baseUrl, app.locals.testMailer);
  try {
    return await fn(baseUrl);
  } finally {
    mailers.delete(baseUrl);
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
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { createApp } from '../app.js';
import { explainAnalysis } from '../../ai/gemini/explainer.js';
import { EXPLANATION_SCHEMA } from '../../ai/gemini/explainer.js';
import { GeminiError } from '../../ai/gemini/geminiClient.js';
import { extractLabel } from '../../ai/gemini/labelExtractor.js';
import { createGoogleVerifier } from '../services/googleVerifier.js';
import { createProfileService } from '../services/profileService.js';
import { HttpError } from '../utils/httpError.js';
import { ImageError } from '../utils/imagePrep.js';
import { createScanService } from '../services/scanService.js';
import { createLogger } from '../utils/logger.js';

export const TEST_ORIGIN = 'http://localhost:5173';
export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
export const TEST_OTP_SECRET = 'test-otp-secret-that-is-at-least-32-characters';

/** In-memory stand-in for the Mongo-backed repository, with the same unique-email behaviour. */
export function createMemoryUserRepository() {
  const users = new Map();
  const duplicate = () => Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
  return {
    users,
    async findByEmail(email) {
      return [...users.values()].find((user) => user.email === email) ?? null;
    },
    async findByGoogleId(googleId) {
      return [...users.values()].find((user) => user.googleId === googleId) ?? null;
    },
    async findById(id) {
      return users.get(String(id)) ?? null;
    },
    async updateName(id, name) {
      const user = users.get(String(id));
      if (!user) return null;
      user.name = name;
      return user;
    },
    async create({ name, email, passwordHash, googleId, emailVerified = false, emailVerifiedAt, authProviders = [] }) {
      if ([...users.values()].some((user) => user.email === email)) throw duplicate();
      if (googleId && [...users.values()].some((user) => user.googleId === googleId)) throw duplicate();
      // Mirrors the Mongoose defaults: an account made "the old way" has no googleId and is not verified.
      const user = { id: randomUUID(), name, email, passwordHash, googleId, emailVerified, emailVerifiedAt, authProviders: [...authProviders], createdAt: new Date() };
      users.set(user.id, user);
      return user;
    },
    async linkGoogle(id, googleId) {
      const user = users.get(String(id));
      if (!user) return null;
      if ([...users.values()].some((other) => other.id !== user.id && other.googleId === googleId)) throw duplicate();
      user.googleId = googleId;
      user.emailVerified = true;
      if (!user.authProviders.includes('google')) user.authProviders.push('google');
      return user;
    },
    async markEmailVerified(id, provider) {
      const user = users.get(String(id));
      if (!user) return null;
      user.emailVerified = true;
      user.emailVerifiedAt ??= new Date();
      if (!user.authProviders.includes(provider)) user.authProviders.push(provider);
      return user;
    },
  };
}

/** A movable clock, so tests can cross the 5-minute expiry and the 60-second cooldown instantly. */
export function createClock(start = Date.UTC(2026, 0, 1)) {
  let current = start;
  const now = () => current;
  now.advance = (ms) => { current += ms; };
  return now;
}

/**
 * In-memory email-code store with the same atomic behaviour as the MongoDB version (JavaScript runs
 * one step at a time, so each method below is atomic just like one findOneAndUpdate).
 */
export function createMemoryOtpRepository() {
  const challenges = new Map();
  const key = (email, purpose) => `${purpose}|${email}`;
  return {
    challenges,
    async find(email, purpose) {
      const doc = challenges.get(key(email, purpose));
      return doc ? structuredClone(doc) : null;
    },
    async upsert({ email, purpose, codeHash, now, expiresAt, pending, link }) {
      const existing = challenges.get(key(email, purpose));
      const doc = { ...(existing ?? { _id: randomUUID(), email, purpose }), codeHash, attempts: 0, lastSentAt: now, expiresAt, ...(pending ? { pending } : {}), ...(link ? { link } : {}) };
      challenges.set(key(email, purpose), doc);
      return structuredClone(doc);
    },
    async incrementAttempts({ email, purpose, now, max }) {
      const doc = challenges.get(key(email, purpose));
      if (!doc || !(doc.expiresAt > now) || !(doc.attempts < max)) return null;
      doc.attempts += 1;
      return structuredClone(doc);
    },
    async consume({ id, codeHash }) {
      for (const [k, doc] of challenges) {
        if (doc._id === id && doc.codeHash === codeHash) {
          challenges.delete(k);
          return structuredClone(doc);
        }
      }
      return null;
    },
    async remove(email, purpose) {
      challenges.delete(key(email, purpose));
    },
  };
}

export function createMemoryNonceRepository() {
  const nonces = new Map();
  return {
    nonces,
    async create({ nonceHash, expiresAt }) {
      nonces.set(nonceHash, { nonceHash, expiresAt });
    },
    async consume({ nonceHash, now }) {
      const doc = nonces.get(nonceHash);
      if (!doc || !(doc.expiresAt > now)) return null;
      nonces.delete(nonceHash);
      return doc;
    },
  };
}

/** A fake email service: records every message (so tests can read the code) and can be made to fail. */
export function createFakeMailer() {
  const outbox = [];
  const state = { failing: false };
  return {
    outbox,
    setFailing(value = true) { state.failing = value; },
    emailService: {
      provider: 'fake',
      async sendOtp({ to, code, purpose }) {
        if (state.failing) throw new HttpError(503, 'EMAIL_SEND_FAILED', "We couldn't send the email. Please try again in a moment.");
        outbox.push({ to, code, purpose });
      },
    },
    /** The newest code sent to this address (optionally for one purpose). */
    latestCode(to, purpose) {
      return [...outbox].reverse().find((m) => m.to === to && (!purpose || m.purpose === purpose))?.code;
    },
    sentTo(to) {
      return outbox.filter((m) => m.to === to).length;
    },
  };
}

export const TEST_GOOGLE_CLIENT_ID = 'test-client-123.apps.googleusercontent.com';

/**
 * Real Google token verification, with keys we control: tokens are signed with a local RSA key and
 * the REAL google-auth-library checks signature, audience, issuer and expiry. Only the download of
 * Google's public keys is replaced.
 */
export function createGoogleTestKit(clientId = TEST_GOOGLE_CLIENT_ID) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const client = new OAuth2Client(clientId);
  client.getFederatedSignonCertsAsync = async () => ({ certs: { 'test-kid': pem }, format: 'PEM' });
  const verifier = createGoogleVerifier({ clientId, client });

  /** A Google-style ID token. Pass claims to override; `signWith` selects another key (a forgery). */
  function sign(claims = {}, { signWith = privateKey } = {}) {
    const payload = { iss: 'https://accounts.google.com', aud: clientId, sub: 'google-sub-1', email: 'asha@example.com', email_verified: true, name: 'Asha Rao', ...claims };
    return jwt.sign(payload, signWith, { algorithm: 'RS256', keyid: 'test-kid', ...(payload.exp ? {} : { expiresIn: 3600 }) });
  }
  return { clientId, verifier, sign, forgeryKey: attacker.privateKey };
}
/** In-memory stand-in for the Mongo-backed profile repository: one profile per user id. */
export function createMemoryProfileRepository() {
  const profiles = new Map();
  return {
    profiles,
    async findByUserId(userId) {
      return profiles.get(String(userId)) ?? null;
    },
    async upsert(userId, values) {
      const key = String(userId);
      const now = new Date();
      const existing = profiles.get(key);
      const doc = {
        _id: existing?._id ?? randomUUID(),
        user: key,
        ...structuredClone(values),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      profiles.set(key, doc);
      return doc;
    },
  };
}

// ---------- Gemini-era scan test helpers ----------

export { fixtures } from './helpers-fixtures.js';
import { fixtures } from './helpers-fixtures.js';

/** A raw Gemini extraction (what the model returns) for a typical Indian biscuit label. */
export const sampleGeminiRaw = () => ({
  isFoodLabel: true,
  productName: 'Crunchy Oat Biscuits',
  brand: 'Test Foods',
  servingSize: { value: 50, unit: 'g' },
  nutrition: {
    columnsFound: ['per 100 g', 'per serve (50 g)'],
    per100Basis: 'g',
    per100g: {
      energyKcal: { value: 480, unit: 'kcal' }, sugar: { value: 8, unit: 'g' }, addedSugar: { value: 7, unit: 'g' }, protein: { value: 15, unit: 'g' },
      fat: { value: 14, unit: 'g' }, saturatedFat: { value: 6, unit: 'g' }, transFat: { value: 0, unit: 'g' }, carbohydrates: { value: 70, unit: 'g' },
      fibre: { value: 4, unit: 'g' }, sodium: { value: 100, unit: 'mg' }, salt: null,
    },
    perServing: {
      energyKcal: { value: 240, unit: 'kcal' }, sugar: { value: 4, unit: 'g' }, addedSugar: { value: 3.5, unit: 'g' }, protein: { value: 7.5, unit: 'g' },
      fat: { value: 7, unit: 'g' }, saturatedFat: { value: 3, unit: 'g' }, transFat: { value: 0, unit: 'g' }, carbohydrates: { value: 35, unit: 'g' },
      fibre: { value: 2, unit: 'g' }, sodium: { value: 50, unit: 'mg' }, salt: null,
    },
  },
  ingredients: { text: 'Rolled oats, Wheat flour, Sugar, Edible vegetable oil (Palm oil), Milk solids, Salt', complete: true },
  allergens: { contains: ['Wheat', 'Milk'], mayContain: ['Peanuts'], sectionReadable: true },
  foodTypeMark: 'veg',
  readability: { imageQuality: 'good', unreadableFields: [], uncertainFields: [], notes: [] },
});

export const sampleExplanation = () => ({
  overview: 'This biscuit has a mixed profile.',
  nutritionExplanation: 'Sugar is medium and protein is high.',
  nutrientLevels: [{ nutrient: 'Sugar', text: 'Sugar is 8 g per 100 g, which is medium.' }],
  ingredientExplanation: 'The list includes sugar and palm oil.',
  allergenWarnings: ['Milk is a confirmed ingredient.'],
  personalMatchExplanation: 'The score comes from the supplied components.',
  advantages: ['High protein.'],
  disadvantages: ['Contains milk.'],
  suggestions: ['Look for a version without milk.'],
  cautions: ['Check the printed label.'],
});

/**
 * A fake Gemini client. `extraction` / `explanation` may be an object (returned), a function
 * (called with the request) or an Error (thrown). Calls are counted so tests can prove that Gemini
 * was or was not used. No network access ever happens in tests.
 */
export function createFakeGemini({ extraction = sampleGeminiRaw(), explanation = sampleExplanation(), isConfigured = true } = {}) {
  const calls = { extraction: 0, explanation: 0, requests: [] };
  const respond = (what, request) => {
    if (what instanceof Error) throw what;
    return typeof what === 'function' ? what(request) : structuredClone(what);
  };
  return {
    isConfigured,
    calls,
    async generateJson(request) {
      calls.requests.push(request);
      if (request.schema === EXPLANATION_SCHEMA) {
        calls.explanation += 1;
        return respond(explanation, request);
      }
      calls.extraction += 1;
      return respond(extraction, request);
    },
  };
}

export function createFakePrepare({ width = 1600, height = 1200 } = {}) {
  const calls = [];
  const fn = async (buffer) => {
    calls.push(buffer.length);
    if (buffer.includes(Buffer.from('CORRUPT'))) throw new ImageError('INVALID_IMAGE', 'This image could not be read. It may be damaged.');
    if (buffer.includes(Buffer.from('HUGEPIXELS'))) throw new ImageError('IMAGE_DIMENSIONS_TOO_LARGE', 'This image has too many pixels. Use a smaller photo.');
    return { buffer: Buffer.from('prepared'), mimeType: 'image/jpeg', width, height };
  };
  fn.calls = calls;
  return fn;
}

/** In-memory stand-in for the Mongo-backed scan repository (always scoped by user). */
export function createMemoryScanRepository() {
  const scans = new Map();
  let tick = 0;
  return {
    scans,
    async create(userId, doc) {
      tick += 1;
      const stored = { ...structuredClone(doc), _id: randomUUID(), user: String(userId), createdAt: new Date(Date.now() + tick), updatedAt: new Date() };
      scans.set(stored._id, stored);
      return structuredClone(stored);
    },
    async listByUser(userId) {
      return [...scans.values()].filter((s) => s.user === String(userId)).sort((a, b) => b.createdAt - a.createdAt).map((s) => structuredClone(s));
    },
    async countByUser(userId) {
      return [...scans.values()].filter((s) => s.user === String(userId)).length;
    },
    async findById(userId, id) {
      const doc = scans.get(String(id));
      return doc && doc.user === String(userId) ? structuredClone(doc) : null;
    },
    async deleteById(userId, id) {
      const doc = scans.get(String(id));
      if (!doc || doc.user !== String(userId)) return false;
      scans.delete(String(id));
      return true;
    },
  };
}

/** The REAL scan service (signature checks, validation, scoring, explanation, saving) with Gemini and image preparation faked. */
export function createTestScanService({ userRepository, profileRepository, gemini = createFakeGemini(), prepare = createFakePrepare(), scanRepository = createMemoryScanRepository(), logger, maxSavedScans } = {}) {
  const scanService = createScanService({
    extractor: ({ buffer, mimeType }) => extractLabel({ client: gemini, buffer, mimeType }),
    explainer: ({ analysis, profile }) => explainAnalysis({ client: gemini, analysis, profile, logger }),
    scanRepository,
    profileService: createProfileService({ profileRepository, userRepository }),
    prepare,
    logger,
    ...(maxSavedScans ? { maxSavedScans } : {}),
  });
  return { scanService, gemini, prepare, scanRepository };
}

export { GeminiError };

export function createCapturingLogger() {
  const lines = [];
  const push = (level) => (message, meta) => lines.push(JSON.stringify({ level, message, ...meta }));
  return { lines, info: push('info'), warn: push('warn'), error: push('error') };
}

export function multipart(parts) {
  const boundary = `----nutrilenstest${randomUUID().replaceAll('-', '')}`;
  const chunks = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(
      Buffer.from(`Content-Disposition: form-data; name="${part.name}"${part.filename ? `; filename="${part.filename}"` : ''}\r\n`),
    );
    if (part.contentType) chunks.push(Buffer.from(`Content-Type: ${part.contentType}\r\n`));
    chunks.push(Buffer.from('\r\n'), Buffer.isBuffer(part.content) ? part.content : Buffer.from(String(part.content)), Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` } };
}

export const imagePart = (content, { name = 'image', filename = 'label.png', contentType = 'image/png' } = {}) => ({
  name,
  filename,
  contentType,
  content,
});

export function uploadImage(url, cookie, parts, extraHeaders = {}) {
  const { body, headers } = multipart(parts);
  return request(url, '/api/scans/extract', {
    method: 'POST',
    headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders },
    body,
  });
}

export function makeTestApp({
  database = 'connected',
  userRepository = createMemoryUserRepository(),
  profileRepository = createMemoryProfileRepository(),
  scanOptions = {},
  uploadMaxBytes = 64 * 1024,
  extractRateLimit = { windowMs: 60_000, max: 1000 },
  analyseRateLimit = { windowMs: 60_000, max: 1000 },
  maxInFlightUploads = 3,
  logger = createLogger({ silent: true }),
  cookie = {},
  authRateLimit = { windowMs: 60_000, max: 1000 },
  otpRateLimits = {},
  mailer = createFakeMailer(),
  clock = createClock(),
  otpRepository = createMemoryOtpRepository(),
  nonceRepository = createMemoryNonceRepository(),
  google = createGoogleTestKit(),
  trustProxy = false,
  emailEnabled = true,
} = {}) {
  // Loose limits by default so ordinary tests never trip them; the rate-limit tests set real ones.
  const looseOtpLimits = {
    sendIp: { windowMs: 60_000, max: 1000 },
    sendEmail: { windowMs: 60_000, max: 1000 },
    sendCooldown: { windowMs: 60_000, max: 1000 },
    verifyIp: { windowMs: 60_000, max: 1000 },
    verifyEmail: { windowMs: 60_000, max: 1000 },
    ...otpRateLimits,
  };
  const scan = createTestScanService({ userRepository, profileRepository, ...scanOptions });
  const app = createApp({
    clientOrigin: TEST_ORIGIN,
    environment: 'test',
    version: '0.0.0-test',
    logger,
    getDatabaseState: () => database,
    userRepository,
    profileRepository,
    scanService: scan.scanService,
    uploadLimits: { maxBytes: uploadMaxBytes },
    extractRateLimit,
    analyseRateLimit,
    maxInFlightUploads,
    authRateLimit,
    otpRateLimits: looseOtpLimits,
    emailService: emailEnabled ? mailer.emailService : undefined,
    otpRepository,
    otpSecret: TEST_OTP_SECRET,
    googleVerifier: google ? google.verifier : undefined,
    nonceRepository,
    trustProxy,
    now: clock,
    auth: {
      jwtSecret: TEST_JWT_SECRET,
      jwtExpiresInSeconds: 3600,
      bcryptRounds: 4, // fast for tests; production uses 12
      cookie: { name: 'nl_token', secure: false, sameSite: 'lax', maxAgeMs: 3_600_000, ...cookie },
    },
  });
  app.locals.testMailer = mailer;
  return { app, userRepository, profileRepository, scan, mailer, clock, otpRepository, nonceRepository, google };
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

export function sendJson(method, url, path, body, headers = {}) {
  return request(url, path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/**
 * Registers a user through the REAL two-step email-code flow (start, read the code from the fake
 * mailbox, verify) and returns { cookie, user } for authenticated requests.
 */
export async function signUp(url, user = validUser) {
  const start = await postJson(url, '/api/auth/register', user);
  if (start.status !== 202) throw new Error(`signUp: registration did not start (${start.status}: ${start.text})`);
  const code = mailers.get(url)?.latestCode(user.email.trim().toLowerCase(), 'register');
  const res = await postJson(url, '/api/auth/register/verify', { email: user.email, code });
  if (res.status !== 201) throw new Error(`signUp: verification failed (${res.status}: ${res.text})`);
  return { cookie: cookieFrom(res, 'nl_token'), user: res.json.user };
}

/** The code most recently emailed to an address by the app served at `url`. */
export function codeFor(url, email, purpose) {
  return mailers.get(url)?.latestCode(email, purpose);
}

export const validPreferences = {
  dietaryPreference: 'vegetarian',
  nutrientPreferences: [
    { nutrient: 'sugar', goal: 'lower', weight: 2 },
    { nutrient: 'protein', goal: 'higher', weight: 3 },
    { nutrient: 'sodium', goal: 'lower', weight: 1 },
  ],
  allergens: ['milk', 'soy'],
  customAllergens: ['Mustard'],
};
