import { ALLERGEN_NAME_KEYWORDS } from '../allergens/allergenData.js';

/** Lower-cases, removes accents and collapses whitespace so keyword matching is stable. */
export function normaliseText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `keyword` appears in `text` as a whole word / phrase. Both should be normalised. */
export function containsKeyword(text, keyword) {
  return new RegExp(`(?<![a-z0-9])${escapeRegExp(keyword)}(?![a-z0-9])`, 'i').test(text);
}

const MARKERS = [
  { type: 'mayContain', pattern: /\b(?:may\s+contain|might\s+contain|traces?\s+of|manufactured\s+in\s+a(?:n)?\s+(?:facility|unit|factory)\s+(?:that|which)\s+(?:also\s+)?(?:handles|processes|uses)|produced\s+in\s+a(?:n)?\s+(?:facility|unit|factory)\s+(?:that|which)\s+(?:also\s+)?(?:handles|processes|uses))\b\s*[:\-]?/gi },
  { type: 'contains', pattern: /\b(?:allergen\s+(?:information|advice)\s*[:\-]?\s*)?contains?\b\s*[:\-]?/gi },
];

function segmentEnd(text, from) {
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (ch === '.' || ch === '\n')) return i;
  }
  return text.length;
}

function mapsToAllergen(segment) {
  const normalised = normaliseText(segment);
  return Object.values(ALLERGEN_NAME_KEYWORDS).some((words) => words.some((word) => containsKeyword(normalised, word)));
}

/**
 * Pulls "Contains: ..." and "May contain ..." sentences out of an ingredient text, in case the
 * label printed them inline. A "Contains ..." sentence is only treated as an allergen statement
 * when it names an allergen ("Contains permitted natural colours" stays an ingredient note).
 */
export function splitStatements(text) {
  let remaining = String(text ?? '');
  const found = { contains: [], mayContain: [] };
  for (const marker of MARKERS) {
    marker.pattern.lastIndex = 0;
    let match = marker.pattern.exec(remaining);
    while (match) {
      const start = match.index;
      const bodyStart = start + match[0].length;
      const end = segmentEnd(remaining, bodyStart);
      const body = remaining.slice(bodyStart, end).trim().replace(/^(?:traces?\s+of|the\s+following)\s*:?\s*/i, '');
      if (body && (marker.type === 'mayContain' || mapsToAllergen(body))) {
        found[marker.type].push(body);
        remaining = `${remaining.slice(0, start)} ${remaining.slice(end + 1)}`;
        marker.pattern.lastIndex = 0;
      } else {
        marker.pattern.lastIndex = bodyStart;
      }
      match = marker.pattern.exec(remaining);
    }
  }
  return {
    ingredientsText: remaining.replace(/\s+/g, ' ').replace(/[,;.\s]+$/, '').trim(),
    containsText: found.contains.join(', ') || null,
    mayContainText: found.mayContain.join(', ') || null,
  };
}

function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if ('([{'.includes(ch)) depth += 1;
    if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function flatten(item, position, parent, out) {
  const open = item.search(/[([{]/);
  const head = open === -1 ? item : item.slice(0, open);
  const name = head.replace(/\d+(?:\.\d+)?\s*%/g, '').trim();
  const normalised = normaliseText(name);
  if (normalised) out.push({ name, normalised, position, parent, nested: parent !== null });
  if (open !== -1) {
    const close = Math.max(item.lastIndexOf(')'), item.lastIndexOf(']'), item.lastIndexOf('}'));
    const inner = item.slice(open + 1, close > open ? close : item.length);
    for (const sub of splitTopLevel(inner)) flatten(sub, position, normalised || parent, out);
  }
}

/** Ingredient items in label order, including sub-ingredients in brackets (position = top-level index). */
export function parseIngredientList(text) {
  const out = [];
  if (!text || !String(text).trim()) return out;
  const cleaned = String(text).replace(/^\s*ingredients?\s*[:\-]?\s*/i, '');
  splitTopLevel(cleaned).forEach((item, index) => flatten(item, index, null, out));
  return out;
}

const CODE_IN_TEXT = /(?:\bins\b|\be)[\s.:-]*(\d{3,4}[a-z]?)/gi;
const CLASS_BRACKET = /(?:colou?rs?|emulsifiers?|stabili[sz]ers?|preservatives?|sweeteners?|acidity regulators?|flavour enhancers?|antioxidants?|raising agents?|anticaking agents?|thickeners?)\s*\(([^)]*)\)/gi;

/** INS / E-number additive codes mentioned in an ingredient text (e.g. "Colour (INS 102)", "Emulsifier (322)"). */
export function extractAdditiveCodes(text) {
  const codes = new Set();
  const source = String(text ?? '');
  for (const match of source.matchAll(CODE_IN_TEXT)) codes.add(match[1].toLowerCase());
  for (const match of source.matchAll(CLASS_BRACKET)) {
    for (const code of match[1].matchAll(/\b(\d{3,4}[a-z]?)\b/gi)) codes.add(code[1].toLowerCase());
  }
  return [...codes];
}
