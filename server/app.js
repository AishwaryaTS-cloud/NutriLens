import cors from 'cors';
import express from 'express';
import { API_PREFIX } from './config/constants.js';
import { createErrorHandler, notFound } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { createHealthRouter } from './routes/health.js';

export function createApp({ clientOrigin, environment, version, logger, getDatabaseState }) {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestLogger(logger));
  app.use(securityHeaders);
  
  app.use(express.json({ limit: '100kb' }));
  app.use(cors({
    origin: (origin, callback) => {
      callback(null, origin === clientOrigin);
    },
    credentials: true,
  }));
  app.use(`${API_PREFIX}/health`, createHealthRouter({ environment, version, getDatabaseState }));

  app.use(notFound);
  app.use(createErrorHandler(logger));
  return app;
}
