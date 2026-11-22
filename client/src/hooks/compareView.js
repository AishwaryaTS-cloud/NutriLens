/** Pure display helpers for the comparison page (no React, so they are unit-tested). */

const SIDE = Object.freeze({ a: 'a', b: 'b' });
export const otherSide = (side) => (side === SIDE.a ? SIDE.b : SIDE.a);

/** Colour tone for a LOW/MEDIUM/HIGH level, depending on whether more or less of the nutrient is better. */
export function levelTone(level, direction) {
  if (!level || !direction) return 'none';
  const l = String(level).toLowerCase();
  if (direction === 'lower') return l === 'low' ? 'good' : l === 'medium' ? 'fair' : 'poor';
  return l === 'high' ? 'good' : l === 'medium' ? 'fair' : 'poor';
}

/** Bar length (0-100) of one value relative to the larger of the two. Missing values draw no bar. */
export function barPercent(value, a, b) {
  if (value === null || value === undefined) return 0;
  const max = Math.max(a ?? 0, b ?? 0);
  return max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
}

const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
const why = (row) => (row.directionSource === 'goal' ? 'your goal' : 'general guidance');

/** One plain sentence about a nutrient row, built only from the row's own fields. */
export function describeNutrientRow(row, names) {
  if (row.missing.length === 2) return { tone: 'muted', text: 'Not available for either product.' };
  if (row.missing.length === 1) return { tone: 'muted', text: `Not available for ${names[row.missing[0]]}, so it can’t be compared.` };
  if (row.relation === 'similar') return { tone: 'muted', text: 'About the same in both products.' };
  const higher = row.relation === 'a_higher' ? 'a' : 'b';
  const gap = `${names[higher]} has ${fmt(row.difference)} ${row.unit} more.`;
  if (!row.direction) return { tone: 'muted', text: `${gap} Shown for information, not judged.` };
  if (!row.better) return { tone: 'muted', text: `${gap} Not judged because the two products use different bases.` };
  return { tone: 'good', text: `${gap} ${row.direction === 'higher' ? 'More' : 'Less'} is better (${why(row)}), so ${names[row.better]} comes out ahead.` };
}

/** Short badge for a value cell: which product is lower or higher. */
export function relationBadge(row, side) {
  if (row.relation !== 'a_higher' && row.relation !== 'b_higher') return null;
  const isHigher = (row.relation === 'a_higher') === (side === 'a');
  return isHigher ? 'Higher' : 'Lower';
}

/** Heading text for the score winner. */
export function verdictText(winner, names) {
  if (winner === 'a' || winner === 'b') return `Better match for you: ${names[winner]}`;
  if (winner === 'tie') return 'Both products have the same Personal Match Score';
  return 'No overall winner: at least one product could not be scored';
}
