import { HttpError } from '../utils/httpError.js';

const MB = 1024 * 1024;
const formatMb = (bytes) => (Math.round((bytes / MB) * 10) / 10).toString();

/** Extra room above the file limit for multipart boundaries and the small form fields. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export const fileTooLarge = (maxBytes) =>
  new HttpError(413, 'FILE_TOO_LARGE', `This image is too large. The limit is ${formatMb(maxBytes)} MB.`);

/**
 * Refuses requests that announce a body far above the limit before any of it is read.
 * (Multer still enforces the exact file limit, because Content-Length can be missing or false.)
 */
export function rejectOversizeRequests(maxBytes) {
  return (req, _res, next) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes + MULTIPART_OVERHEAD_BYTES) {
      next(fileTooLarge(maxBytes));
      return;
    }
    next();
  };
}

/**
 * Caps how many upload requests are in flight at once. Uploads are buffered in memory, so this
 * bounds peak memory on small hosts. The slot is released when the response ends or the client
 * disconnects.
 */
export function createInFlightLimiter({ max }) {
  let inFlight = 0;
  return (req, res, next) => {
    if (inFlight >= max) {
      next(new HttpError(503, 'SERVER_BUSY', 'The server is busy reading other images. Please try again shortly.'));
      return;
    }
    inFlight += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      inFlight -= 1;
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
}

/** Turns Multer's errors into the API's error envelope. Never echoes file names or contents. */
export function mapMulterError(err, { maxBytes }) {
  if (err instanceof HttpError) return err;
  switch (err?.code) {
    case 'LIMIT_FILE_SIZE':
      return fileTooLarge(maxBytes);
    case 'LIMIT_UNEXPECTED_FILE':
      return new HttpError(400, 'UNEXPECTED_FIELD', 'Send the image in a single field named "image".');
    case 'LIMIT_FILE_COUNT':
      return new HttpError(400, 'TOO_MANY_FILES', 'Upload one image at a time.');
    default:
      // Field/part limits, malformed multipart bodies and anything else the parser rejects.
      return new HttpError(400, 'INVALID_UPLOAD', 'The upload could not be read. Please try again.');
  }
}
