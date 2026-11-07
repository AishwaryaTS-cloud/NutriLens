import { HttpError } from '../utils/httpError.js';

function errorBody(code, message, details) {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

export function notFound(req, res) {
  res.status(404).json(errorBody('NOT_FOUND', `Route ${req.method} ${req.path} does not exist.`));
}

// Express recognises an error handler by its four parameters, so `_next` must stay.
export function createErrorHandler(logger) {
  return (err, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json(errorBody(err.code, err.message, err.details));
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json(errorBody('INVALID_JSON', 'The request body is not valid JSON.'));
      return;
    }
    if (err?.type === 'entity.too.large') {
      res.status(413).json(errorBody('PAYLOAD_TOO_LARGE', 'The request body is too large.'));
      return;
    }
    logger.error('unhandled error', { name: err?.name, message: err?.message });
    res
      .status(500)
      .json(errorBody('INTERNAL_ERROR', 'Something went wrong on our side. Try again in a moment.'));
  };
}
