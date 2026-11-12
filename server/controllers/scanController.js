import { ALLOWED_IMAGE_TYPES } from '../config/constants.js';
import { HttpError } from '../utils/httpError.js';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const badBody = (field, message) => new HttpError(400, 'VALIDATION_ERROR', 'Please check the request.', { [field]: message });
const idParam = (value) => (typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : undefined);

export function createScanController({ scanService, maxUploadBytes }) {
  return {
    /** Lets the browser show the same limits the server enforces. */
    options(_req, res) {
      res.json({
        options: {
          maxUploadBytes,
          maxUploadMb: Math.round((maxUploadBytes / (1024 * 1024)) * 10) / 10,
          allowedTypes: [...ALLOWED_IMAGE_TYPES],
        },
      });
    },

    async extract(req, res) {
      const file = req.file;
      try {
        if (!file) throw new HttpError(400, 'NO_FILE', 'Choose an image to read.');
        if (file.size === 0 || file.buffer.length === 0) throw new HttpError(400, 'EMPTY_FILE', 'That file is empty.');
        const extraction = await scanService.extractFromImage({ buffer: file.buffer, declaredType: file.mimetype });
        res.json({ extraction });
      } finally {
        // Release the uploaded bytes straight away; nothing is kept after the response.
        if (file) file.buffer = null;
        req.file = undefined;
      }
    },

    async analyse(req, res) {
      if (!isObject(req.body) || !isObject(req.body.label)) throw badBody('label', 'Send the label to analyse.');
      res.json(await scanService.analyse({ userId: req.user.id, label: req.body.label }));
    },

    async save(req, res) {
      const { label, explanation } = req.body ?? {};
      if (!isObject(label)) throw badBody('label', 'Send the label to save.');
      if (explanation !== undefined && !isObject(explanation)) throw badBody('explanation', 'The explanation must be an object.');
      res.status(201).json({ scan: await scanService.save({ userId: req.user.id, label, explanation }) });
    },

    async list(req, res) {
      res.json({ scans: await scanService.list(req.user.id) });
    },

    async get(req, res) {
      const id = idParam(req.params.id);
      if (!id) throw new HttpError(404, 'SCAN_NOT_FOUND', 'That scan was not found.');
      res.json({ scan: await scanService.get(req.user.id, id) });
    },

    async remove(req, res) {
      const id = idParam(req.params.id);
      if (!id) throw new HttpError(404, 'SCAN_NOT_FOUND', 'That scan was not found.');
      await scanService.remove(req.user.id, id);
      res.status(204).end();
    },

    async compare(req, res) {
      res.json({ comparison: await scanService.compare(req.user.id, idParam(req.query.a), idParam(req.query.b)) });
    },

    async summary(req, res) {
      res.json({ summary: await scanService.summary(req.user.id) });
    },
  };
}
