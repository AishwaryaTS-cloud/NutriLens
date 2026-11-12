/**
 * State machine for the Scan page (no React, so it can be tested).
 *
 *   idle -> selected -> extracting -> review -> analysing -> results
 *     \                    |            ^  \________ (fail) ___/
 *      \-> (manual) -------+--> failed --/
 *
 * Nothing is saved until the user presses Save. The image never leaves the browser except for the
 * single upload to the server, which forwards it to Gemini and keeps nothing.
 */
import { emptyForm, labelToForm } from './labelForm.js';

export const FALLBACK_OPTIONS = Object.freeze({
  maxUploadBytes: 5 * 1024 * 1024,
  maxUploadMb: 5,
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
});

export const initialScanState = Object.freeze({
  phase: 'idle',
  file: null,
  previewUrl: null,
  error: null, // { message, code, status }
  progress: 0,
  extraction: null, // { status, readability, issues, columnsFound }
  form: emptyForm(),
  issues: [], // issues from the server for the current form
  analysis: null,
  explanation: null,
  savedId: null,
  saving: false,
});

export const formatMb = (bytes) => String(Math.round((bytes / (1024 * 1024)) * 10) / 10);

export function validateImageFile(file, options = FALLBACK_OPTIONS) {
  if (!file) return 'Choose an image to read.';
  if (!options.allowedTypes.includes(file.type)) return 'Choose a JPG, PNG or WebP image.';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > options.maxUploadBytes) {
    return `That image is ${formatMb(file.size)} MB. The limit is ${formatMb(options.maxUploadBytes)} MB. Try a smaller photo.`;
  }
  return undefined;
}

export function scanReducer(state, action) {
  switch (action.type) {
    case 'REJECT_FILE':
      if (state.phase === 'extracting') return state;
      return { ...initialScanState, error: { message: action.message, code: 'INVALID_FILE' } };

    case 'SELECT':
      if (state.phase === 'extracting') return state;
      return { ...initialScanState, phase: 'selected', file: action.file, previewUrl: action.previewUrl };

    case 'EXTRACT_START':
      if (!['selected', 'failed'].includes(state.phase) || !state.file) return state;
      return { ...state, phase: 'extracting', error: null, progress: 0 };

    case 'PROGRESS':
      return state.phase === 'extracting' ? { ...state, progress: action.percent } : state;

    case 'EXTRACT_OK': {
      if (state.phase !== 'extracting') return state;
      const { label, issues, status, readability, columnsFound, isFoodLabel } = action.extraction;
      return {
        ...state,
        phase: 'review',
        error: null,
        extraction: { status, readability, issues, columnsFound: columnsFound ?? [], isFoodLabel },
        form: labelToForm(label),
        issues: issues ?? [],
      };
    }

    case 'EXTRACT_FAIL':
      if (state.phase !== 'extracting') return state;
      return { ...state, phase: 'failed', error: action.error };

    case 'MANUAL':
      if (state.phase === 'extracting' || state.phase === 'analysing') return state;
      return { ...state, phase: 'review', error: null, extraction: null, form: emptyForm(), issues: [], analysis: null, explanation: null, savedId: null };

    case 'EDIT':
      if (state.phase !== 'review') return state;
      return { ...state, form: action.form };

    case 'ANALYSE_START':
      if (state.phase !== 'review') return state;
      return { ...state, phase: 'analysing', error: null, issues: [] };

    case 'ANALYSE_OK':
      if (state.phase !== 'analysing') return state;
      return { ...state, phase: 'results', analysis: action.analysis, explanation: action.explanation, issues: action.analysis.issues ?? [], savedId: null };

    case 'ANALYSE_FAIL':
      if (state.phase !== 'analysing') return state;
      return { ...state, phase: 'review', error: action.error, issues: action.issues ?? [] };

    case 'BACK_TO_EDIT':
      return state.phase === 'results' ? { ...state, phase: 'review', savedId: null } : state;

    case 'SAVE_START':
      return state.phase === 'results' && !state.savedId ? { ...state, saving: true, error: null } : state;
    case 'SAVED':
      return { ...state, saving: false, savedId: action.id };
    case 'SAVE_FAIL':
      return { ...state, saving: false, error: action.error };

    case 'RESET':
      return { ...initialScanState };

    default:
      return state;
  }
}
