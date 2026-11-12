import mongoose from 'mongoose';

/**
 * A saved scan: the confirmed (validated) label, the deterministic analysis that was calculated from
 * it, and the explanation. The image itself is never stored. The server recalculates the analysis
 * before saving, so stored scores always come from the scoring modules, never from the client.
 */
const scanSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productName: { type: String, trim: true, maxlength: 120, default: null },
    brand: { type: String, trim: true, maxlength: 120, default: null },
    finalScore: { type: Number, min: 0, max: 100, default: null },
    status: { type: String, enum: ['scored', 'partial', 'insufficient_data'], required: true },
    allergenConflict: { type: Boolean, default: false },
    allergenStatus: { type: String, enum: ['complete', 'incomplete', 'unavailable'], required: true },
    scoringVersion: { type: String, required: true },
    label: { type: mongoose.Schema.Types.Mixed, required: true },
    analysis: { type: mongoose.Schema.Types.Mixed, required: true },
    explanation: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true, minimize: false },
);
scanSchema.index({ user: 1, createdAt: -1 });

export const Scan = mongoose.models.Scan || mongoose.model('Scan', scanSchema);
