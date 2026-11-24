import mongoose from 'mongoose';

/**
 * One pending email code. There is at most one per (email, purpose), so asking for a new code
 * replaces the old one. Only a keyed HMAC of the code is stored, never the code itself.
 *   register: the sign-up details are held here until the email is proven (no User exists yet)
 *   login:    passwordless sign-in for an existing account
 *   link:     proves inbox ownership before a Google identity is attached to an existing account
 */
const otpChallengeSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  purpose: { type: String, required: true, enum: ['register', 'login', 'link'] },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0, min: 0 },
  lastSentAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  pending: { name: { type: String }, passwordHash: { type: String } },
  link: { userId: { type: String }, googleId: { type: String } },
});

otpChallengeSchema.index({ email: 1, purpose: 1 }, { unique: true });
// TTL cleanup: MongoDB deletes the document shortly after expiresAt (the check on use is exact).
otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpChallenge = mongoose.models.OtpChallenge || mongoose.model('OtpChallenge', otpChallengeSchema);
