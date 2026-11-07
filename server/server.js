import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { connectDb, disconnectDb, getDatabaseState, onDbError } from './config/db.js';
import { EnvValidationError, parseEnv } from './config/env.js';
import { readVersion } from './config/version.js';
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

const app = createApp({
  clientOrigin: env.clientOrigin,
  environment: env.nodeEnv,
  version,
  logger,
  getDatabaseState,
});

const server = app.listen(env.port, () => {
  logger.info('NutriLens API listening', { port: env.port, env: env.nodeEnv, version });
});

onDbError((err) => logger.error('MongoDB connection error', { name: err.name, message: err.message }));

try {
  await connectDb(env.mongoUri);
  logger.info('MongoDB connected');
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
