import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { AUTH_COOKIE_NAME, BCRYPT_ROUNDS } from './config/constants.js';
import { connectDb, disconnectDb, getDatabaseState, onDbError } from './config/db.js';
import { EnvValidationError, parseEnv } from './config/env.js';
import { readVersion } from './config/version.js';
import { explainAnalysis } from '../ai/gemini/explainer.js';
import { createGeminiClient } from '../ai/gemini/geminiClient.js';
import { extractLabel } from '../ai/gemini/labelExtractor.js';
import { Profile } from './models/Profile.js';
import { Scan } from './models/Scan.js';
import { User } from './models/User.js';
import { createProfileRepository } from './services/profileRepository.js';
import { createProfileService } from './services/profileService.js';
import { createScanRepository } from './services/scanRepository.js';
import { createScanService } from './services/scanService.js';
import { createUserRepository } from './services/userRepository.js';
import { createLogger } from './utils/logger.js';

// One .env file in the project root is shared by the server and the Vite client.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

let env;
try {
  env = parseEnv(process.env);
} catch (err) {
  if (err instanceof EnvValidationError) {
    console.error(err.message);
    console.error('\nCopy .env.example to .env in the project root and fill in the values.');
    process.exit(1);
  }
  throw err;
}

const logger = createLogger();
const version = readVersion();

// Gemini is called from the server only. Without GEMINI_API_KEY the app still runs: label reading is
// unavailable (values can be typed in) and explanations fall back to rule-based text.
const gemini = createGeminiClient({ apiKey: env.geminiApiKey, model: env.geminiModel, timeoutMs: env.geminiTimeoutMs, dailyLimit: env.geminiDailyLimit, logger });
if (!gemini.isConfigured) logger.warn('GEMINI_API_KEY is not set: label reading is disabled and explanations use rules only');

const userRepository = createUserRepository();
const profileRepository = createProfileRepository();
const scanService = createScanService({
  extractor: ({ buffer, mimeType }) => extractLabel({ client: gemini, buffer, mimeType }),
  explainer: ({ analysis, profile }) => explainAnalysis({ client: gemini, analysis, profile, logger }),
  scanRepository: createScanRepository(),
  profileService: createProfileService({ profileRepository, userRepository }),
  logger,
});

const app = createApp({
  clientOrigin: env.clientOrigin,
  environment: env.nodeEnv,
  version,
  logger,
  getDatabaseState,
  userRepository,
  profileRepository,
  scanService,
  uploadLimits: { maxBytes: env.maxUploadBytes },
  auth: {
    jwtSecret: env.jwtSecret,
    jwtExpiresInSeconds: env.jwtExpiresInSeconds,
    bcryptRounds: BCRYPT_ROUNDS,
    cookie: {
      name: AUTH_COOKIE_NAME,
      secure: env.cookieSecure,
      sameSite: env.cookieSameSite,
      maxAgeMs: env.jwtExpiresInSeconds * 1000,
    },
  },
});

const server = app.listen(env.port, () => {
  logger.info('NutriLens API listening', { port: env.port, env: env.nodeEnv, version });
});

onDbError((err) => logger.error('MongoDB connection error', { name: err.name, message: err.message }));

try {
  await connectDb(env.mongoUri);
  logger.info('MongoDB connected');
  // Builds the unique email index so duplicate accounts are impossible, not just unlikely.
  await User.init();
  await Profile.init(); // one profile per user, enforced by a unique index
  await Scan.init();
} catch (err) {
  const detail = { name: err.name, message: err.message };
  if (env.nodeEnv === 'production') {
    logger.error('MongoDB connection failed; exiting', detail);
    process.exit(1);
  }
  logger.warn('MongoDB is not connected. Running in degraded mode (check MONGODB_URI).', detail);
}

function shutdown(signal) {
  logger.info('shutting down', { signal });
  server.close(() => {
    disconnectDb().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
