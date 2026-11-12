import { api } from './api.js';

/** The upload limits the server enforces, so the page can show and check the same ones. */
export async function fetchScanOptions() {
  const { data } = await api.get('/scans/options');
  return data.options;
}

/**
 * Sends one image to the server, which sends it to Gemini Vision. The file is held only in the
 * browser until this call; the server keeps nothing. Resolves to the extraction
 * { status, label, issues, readability, ... } for the user to review.
 */
export async function extractLabel(file, { signal, onUploadProgress } = {}) {
  const form = new FormData();
  form.append('image', file);
  const { data } = await api.post('/scans/extract', form, {
    signal,
    timeout: 100_000,
    onUploadProgress: (event) => {
      if (event.total) onUploadProgress?.(Math.round((event.loaded / event.total) * 100));
    },
  });
  return data.extraction;
}

/** Deterministic analysis + explanation of a confirmed label. Nothing is saved. */
export async function analyseLabel(label, { signal } = {}) {
  const { data } = await api.post('/scans/analyse', { label }, { signal, timeout: 100_000 });
  return { analysis: data.analysis, explanation: data.explanation };
}

export async function saveScan({ label, explanation }) {
  const { data } = await api.post('/scans', { label, explanation });
  return data.scan;
}

export async function listScans() {
  const { data } = await api.get('/scans');
  return data.scans;
}

export async function getScan(id) {
  const { data } = await api.get(`/scans/${encodeURIComponent(id)}`);
  return data.scan;
}

export async function deleteScan(id) {
  await api.delete(`/scans/${encodeURIComponent(id)}`);
}

export async function compareScans(a, b) {
  const { data } = await api.get('/scans/compare', { params: { a, b } });
  return data.comparison;
}

export async function fetchSummary() {
  const { data } = await api.get('/scans/summary');
  return data.summary;
}
