import { classifyAll } from '../scoring/nutrientScores.js';
import { computePersonalMatch } from '../scoring/personalMatch.js';
import { validateLabel } from '../nutrition/labelValidator.js';

/**
 * The single entry point for every analysis (new scans, saved scans and comparisons all use it).
 * Returns { ok:false, issues } when validation fails; otherwise the full deterministic analysis.
 */
export function analyseLabel({ label, profile }) {
  const validated = validateLabel(label);
  if (!validated.ok) return { ok: false, issues: validated.issues, label: validated.label };
  const match = computePersonalMatch({ label: validated.label, per100: validated.per100, profile });
  return {
    ok: true,
    label: validated.label,
    per100: validated.per100,
    per100Source: validated.per100Source,
    issues: validated.issues,
    nutrients: classifyAll(validated.per100),
    match,
  };
}
