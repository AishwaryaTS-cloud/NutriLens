import { compareProducts } from '../../ai/comparison/compareProducts.js';
import { analyseLabel } from '../../ai/analysis/analyseLabel.js';
import { buildExplanationFacts } from '../../ai/explanations/facts.js';
import { buildRuleBasedExplanation } from '../../ai/explanations/ruleBased.js';
import { findUnverifiedNumbers, sanitizeExplanation } from '../../ai/gemini/explainer.js';
import { GeminiError } from '../../ai/gemini/geminiClient.js';
import { MAX_SAVED_SCANS } from '../config/constants.js';
import { HttpError } from '../utils/httpError.js';
import { ImageError, prepareImage } from '../utils/imagePrep.js';
import { sniffImageType } from '../utils/imageSniffer.js';
import { toPublicScan, toScanSummary } from '../utils/publicScan.js';

const MANUAL = ' You can still enter the label values by hand.';
const GEMINI_HTTP = {
  GEMINI_NOT_CONFIGURED: [503, 'GEMINI_NOT_CONFIGURED', `Reading labels with Gemini is not set up on this server.${MANUAL}`],
  GEMINI_QUOTA: [429, 'GEMINI_QUOTA_EXCEEDED', `The free Gemini quota is used up for now. Try again later.${MANUAL}`],
  GEMINI_LIMIT: [429, 'GEMINI_DAILY_LIMIT', `This app's daily Gemini limit was reached. Try again tomorrow.${MANUAL}`],
  GEMINI_AUTH: [503, 'GEMINI_UNAVAILABLE', `Gemini is not available right now.${MANUAL}`],
  GEMINI_MODEL: [503, 'GEMINI_UNAVAILABLE', `Gemini is not available right now.${MANUAL}`],
  GEMINI_UNAVAILABLE: [503, 'GEMINI_UNAVAILABLE', `Gemini is not available right now. Please try again shortly.${MANUAL}`],
  GEMINI_TIMEOUT: [504, 'GEMINI_TIMEOUT', `Gemini took too long to read the image. Please try again.${MANUAL}`],
  GEMINI_BLOCKED: [422, 'GEMINI_BLOCKED', `Gemini could not process this image. Try a different photo.${MANUAL}`],
  GEMINI_BAD_RESPONSE: [502, 'GEMINI_BAD_RESPONSE', `Gemini sent an answer that could not be used. Please try again.${MANUAL}`],
};

/** Maps image and Gemini failures to API errors. Messages are fixed text: nothing user-supplied is echoed. */
export function toHttpError(err) {
  if (err instanceof HttpError) return err;
  if (err instanceof ImageError) return new HttpError(err.code === 'UNSUPPORTED_FILE_TYPE' ? 415 : 422, err.code, err.message);
  if (err instanceof GeminiError) {
    const [status, code, message] = GEMINI_HTTP[err.code] ?? GEMINI_HTTP.GEMINI_UNAVAILABLE;
    return new HttpError(status, code, message);
  }
  return new HttpError(500, 'EXTRACTION_FAILED', `The image could not be read. Please try again.${MANUAL}`);
}

const idOf = (doc) => String(doc._id ?? doc.id);

/**
 * Orchestrates scans: Gemini extraction, validated analysis, explanation, saving, history,
 * comparison and the dashboard summary. Collaborators are injected so tests never call Gemini.
 *  extractor({ buffer, mimeType })              -> normalised extraction (Gemini Vision)
 *  explainer({ analysis, profile })             -> { source, fallbackReason, explanation }
 */
export function createScanService({ extractor, explainer, scanRepository, profileService, prepare = prepareImage, logger, maxSavedScans = MAX_SAVED_SCANS }) {
  async function analyseFor(userId, label) {
    const profile = await profileService.get(userId);
    const analysis = analyseLabel({ label, profile });
    if (!analysis.ok) {
      throw new HttpError(422, 'LABEL_INVALID', 'Some label values need fixing before the analysis can run.', { issues: analysis.issues });
    }
    return { profile, analysis };
  }

  /** Loads or analyses both products with the CURRENT profile, then builds the comparison. */
  async function compareInputs(userId, inputs) {
    const profile = await profileService.get(userId);
    const build = async (input, position) => {
      if (input.scanId) {
        const doc = await scanRepository.findById(userId, input.scanId);
        if (!doc) throw new HttpError(404, 'SCAN_NOT_FOUND', 'One of those scans was not found.');
        const analysis = analyseLabel({ label: doc.label, profile });
        if (!analysis.ok) throw new HttpError(422, 'LABEL_INVALID', 'A saved scan could not be re-analysed.');
        return { id: idOf(doc), saved: true, productName: doc.productName ?? null, brand: doc.brand ?? null, analysis };
      }
      const analysis = analyseLabel({ label: input.label, profile });
      if (!analysis.ok) throw new HttpError(422, 'LABEL_INVALID', `The ${position} product has label values that need fixing before it can be compared.`, { issues: analysis.issues });
      return { id: null, saved: false, productName: analysis.label.productName ?? null, brand: analysis.label.brand ?? null, analysis };
    };
    const first = await build(inputs[0], 'first');
    const second = await build(inputs[1], 'second');
    const sa = first.analysis.match.finalScore;
    const sb = second.analysis.match.finalScore;
    const notes = [];
    let winner = null;
    if (sa !== null && sb !== null) winner = sa === sb ? 'tie' : sa > sb ? 'a' : 'b';
    else notes.push('At least one product has too little nutrition data for a score, so no winner is named.');
    for (const [name, item] of [['First', first], ['Second', second]]) {
      if (item.analysis.match.allergenPenalty.hasConfirmedConflict) notes.push(`${name} product has a confirmed allergen conflict with your saved allergens. Its score is capped at 49.`);
      else if (item.analysis.match.allergens.status !== 'complete') notes.push(`${name} product: allergen safety could not be established.`);
    }
    const details = compareProducts({
      a: { name: first.productName, analysis: first.analysis },
      b: { name: second.productName, analysis: second.analysis },
      profile,
    });
    return { a: first, b: second, winner, notes, details, scoringVersion: first.analysis.match.version };
  }

  return {
    async extractFromImage({ buffer, declaredType }) {
      const actualType = sniffImageType(buffer);
      if (!actualType) throw new HttpError(415, 'UNSUPPORTED_FILE_TYPE', 'This file is not a JPG, PNG or WebP image.');
      if (actualType !== declaredType) throw new HttpError(415, 'FILE_TYPE_MISMATCH', 'The file contents do not match its type. Choose a JPG, PNG or WebP image.');
      const startedAt = Date.now();
      try {
        const prepared = await prepare(buffer);
        const extraction = await extractor({ buffer: prepared.buffer, mimeType: prepared.mimeType });
        // Outcome only: never the image, file name or extracted text.
        logger?.info('label extracted', { status: extraction.status, ms: Date.now() - startedAt });
        return { ...extraction, image: { width: prepared.width, height: prepared.height } };
      } catch (err) {
        const httpError = toHttpError(err);
        logger?.warn('label extraction failed', { code: httpError.code, status: httpError.status, ms: Date.now() - startedAt });
        throw httpError;
      }
    },

    /** Deterministic analysis plus explanation. Nothing is saved. */
    async analyse({ userId, label }) {
      const { profile, analysis } = await analyseFor(userId, label);
      const explained = await explainer({ analysis, profile });
      return { analysis, explanation: { source: explained.source, fallbackReason: explained.fallbackReason, content: explained.explanation } };
    },

    /**
     * Saves a scan. The analysis is recalculated here. A Gemini-written explanation sent by the client
     * is kept only if it has the right shape and uses only numbers from the verified facts; otherwise
     * the rule-based explanation is stored.
     */
    async save({ userId, label, explanation }) {
      if ((await scanRepository.countByUser(userId)) >= maxSavedScans) {
        throw new HttpError(409, 'SCAN_LIMIT_REACHED', `You can keep up to ${maxSavedScans} saved scans. Delete some to save more.`);
      }
      const { profile, analysis } = await analyseFor(userId, label);
      let stored = { source: 'rules', fallbackReason: explanation?.fallbackReason ?? null, content: buildRuleBasedExplanation(analysis, profile) };
      if (explanation?.source === 'gemini') {
        const clean = sanitizeExplanation(explanation.content);
        if (clean && findUnverifiedNumbers(clean, buildExplanationFacts(analysis, profile)).length === 0) stored = { source: 'gemini', fallbackReason: null, content: clean };
      }
      const { match } = analysis;
      const doc = await scanRepository.create(userId, {
        productName: analysis.label.productName,
        brand: analysis.label.brand,
        finalScore: match.finalScore,
        status: match.status,
        allergenConflict: match.allergenPenalty.hasConfirmedConflict,
        allergenStatus: match.allergens.status,
        scoringVersion: match.version,
        label: analysis.label,
        analysis,
        explanation: stored,
      });
      return toPublicScan(doc);
    },

    async list(userId) {
      return (await scanRepository.listByUser(userId)).map(toScanSummary);
    },

    async get(userId, id) {
      const doc = await scanRepository.findById(userId, id);
      if (!doc) throw new HttpError(404, 'SCAN_NOT_FOUND', 'That scan was not found.');
      return toPublicScan(doc);
    },

    async remove(userId, id) {
      if (!(await scanRepository.deleteById(userId, id))) throw new HttpError(404, 'SCAN_NOT_FOUND', 'That scan was not found.');
    },

    /** Re-scores two saved scans with the CURRENT profile using the same calculation functions. */
    async compare(userId, a, b) {
      if (!a || !b || a === b) throw new HttpError(400, 'COMPARE_INVALID', 'Choose two different saved scans to compare.');
      return compareInputs(userId, [{ scanId: a }, { scanId: b }]);
    },

    /**
     * Compares any two products, each either a saved scan ({ scanId }) or a freshly analysed,
     * not-yet-saved label ({ label }). Same analysis and scoring functions as everywhere else.
     */
    async compareProducts(userId, a, b) {
      if (a.scanId && b.scanId && a.scanId === b.scanId) throw new HttpError(400, 'COMPARE_INVALID', 'Choose two different products to compare.');
      return compareInputs(userId, [a, b]);
    },

    async summary(userId) {
      const scans = await scanRepository.listByUser(userId);
      const scored = scans.filter((s) => s.finalScore !== null);
      const average = scored.length ? Math.round((scored.reduce((sum, s) => sum + s.finalScore, 0) / scored.length) * 10) / 10 : null;
      return {
        total: scans.length,
        averageScore: average,
        bands: {
          strong: scored.filter((s) => s.finalScore >= 70).length,
          moderate: scored.filter((s) => s.finalScore >= 50 && s.finalScore < 70).length,
          weak: scored.filter((s) => s.finalScore < 50).length,
          unscored: scans.length - scored.length,
        },
        allergenConflicts: scans.filter((s) => s.allergenConflict).length,
        incompleteAllergenInfo: scans.filter((s) => s.allergenStatus !== 'complete').length,
        recent: scans.slice(0, 5).map(toScanSummary),
        maxSavedScans,
      };
    },
  };
}
