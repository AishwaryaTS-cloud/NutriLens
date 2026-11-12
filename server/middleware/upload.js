import multer from 'multer';
import { ALLOWED_IMAGE_TYPES } from '../config/constants.js';
import { HttpError } from '../utils/httpError.js';
import { mapMulterError, rejectOversizeRequests } from './uploadGuards.js';

/**
 * Multer configured for one image in the "image" field, held in memory only (nothing touches disk).
 * Limits follow Multer's advisory for CVE-2026-5079 (deeply nested field names): use multer >= 2.2.0
 * and keep `fieldNestingDepth` at the minimum this endpoint needs.
 */
export function createUploadMiddleware({ maxBytes }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxBytes,
      files: 1,
      fields: 0, // the image only: no extra form fields
      parts: 1,
      fieldNameSize: 20,
      fieldSize: 16,
      headerPairs: 20,
      fieldNestingDepth: 0,
    },
    // First, cheap filter on the label the browser sent. The real contents are checked later.
    fileFilter(_req, file, callback) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
        callback(new HttpError(415, 'UNSUPPORTED_FILE_TYPE', 'Choose a JPG, PNG or WebP image.'));
        return;
      }
      callback(null, true);
    },
  }).single('image');

  const refuseOversize = rejectOversizeRequests(maxBytes);

  return [
    refuseOversize,
    (req, res, next) => {
      upload(req, res, (err) => (err ? next(mapMulterError(err, { maxBytes })) : next()));
    },
  ];
}
