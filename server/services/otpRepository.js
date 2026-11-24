import { OtpChallenge } from '../models/OtpChallenge.js';
import { AuthNonce } from '../models/AuthNonce.js';

const DUPLICATE_KEY_CODE = 11000;

/**
 * Data access for email-code challenges. Every state change is a single atomic MongoDB operation,
 * so two simultaneous requests can never both consume one code or share an attempt counter.
 */
export function createOtpRepository(Model = OtpChallenge) {
  return {
    find(email, purpose) {
      return Model.findOne({ email, purpose }).lean();
    },

    /** Creates or replaces the single challenge for (email, purpose) with a fresh code. */
    async upsert({ email, purpose, codeHash, now, expiresAt, pending, link }) {
      const set = { codeHash, attempts: 0, lastSentAt: now, expiresAt };
      if (pending) set.pending = pending;
      if (link) set.link = link;
      const run = (upsert) => Model.findOneAndUpdate({ email, purpose }, { $set: set }, { upsert, new: true }).lean();
      try {
        return await run(true);
      } catch (err) {
        // Two simultaneous first requests: the unique index let one insert win; update that one.
        if (err?.code === DUPLICATE_KEY_CODE) return run(false);
        throw err;
      }
    },

    /**
     * Counts one guess. Returns the updated challenge, or null if there is none, it has expired
     * or its five attempts are used up. The filter and the increment happen in one step.
     */
    incrementAttempts({ email, purpose, now, max }) {
      return Model.findOneAndUpdate(
        { email, purpose, expiresAt: { $gt: now }, attempts: { $lt: max } },
        { $inc: { attempts: 1 } },
        { new: true },
      ).lean();
    },

    /** Atomically deletes the challenge and returns it, or null if somebody already consumed it. */
    consume({ id, codeHash }) {
      return Model.findOneAndDelete({ _id: id, codeHash }).lean();
    },

    async remove(email, purpose) {
      await Model.deleteOne({ email, purpose });
    },
  };
}

/** Single-use Google sign-in nonces (stored hashed). */
export function createNonceRepository(Model = AuthNonce) {
  return {
    async create({ nonceHash, expiresAt }) {
      await Model.create({ nonceHash, expiresAt });
    },
    /** Deletes and returns the nonce only if it exists and has not expired: one use, ever. */
    consume({ nonceHash, now }) {
      return Model.findOneAndDelete({ nonceHash, expiresAt: { $gt: now } }).lean();
    },
  };
}
