import { OAuth2Client } from 'google-auth-library';
import { HttpError } from '../utils/httpError.js';

/**
 * Verifies a Google ID token with Google's official library. verifyIdToken checks the RS256
 * signature against Google's published keys, the issuer (accounts.google.com), that the audience
 * is OUR client id, and that the token has not expired. The caller still has to check the nonce
 * and email_verified, which the library does not.
 * `client` is injectable so tests can supply their own signing keys; no secret is involved.
 */
export function createGoogleVerifier({ clientId, client = new OAuth2Client(clientId), logger }) {
  return {
    async verify(idToken) {
      try {
        const ticket = await client.verifyIdToken({ idToken, audience: clientId });
        const payload = ticket.getPayload();
        if (!payload) throw new Error('empty payload');
        return payload;
      } catch (err) {
        logger?.warn('Google ID token rejected', { reason: String(err?.message ?? 'unknown').slice(0, 80) });
        throw new HttpError(401, 'GOOGLE_TOKEN_INVALID', 'Google sign-in could not be verified. Please try again.');
      }
    },
  };
}
