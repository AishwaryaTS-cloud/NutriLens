const idOf = (doc) => String(doc._id ?? doc.id);

export function toScanSummary(doc) {
  return {
    id: idOf(doc),
    productName: doc.productName ?? null,
    brand: doc.brand ?? null,
    finalScore: doc.finalScore ?? null,
    status: doc.status,
    allergenConflict: Boolean(doc.allergenConflict),
    allergenStatus: doc.allergenStatus,
    createdAt: doc.createdAt,
  };
}

/** Full scan for the detail page. Never exposes the user id or database internals. */
export function toPublicScan(doc) {
  return { ...toScanSummary(doc), scoringVersion: doc.scoringVersion, label: doc.label, analysis: doc.analysis, explanation: doc.explanation };
}
