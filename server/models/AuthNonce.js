import mongoose from 'mongoose';

/** A single-use Google sign-in nonce. Only its SHA-256 is stored. */
const authNonceSchema = new mongoose.Schema({
  nonceHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
});
authNonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthNonce = mongoose.models.AuthNonce || mongoose.model('AuthNonce', authNonceSchema);
