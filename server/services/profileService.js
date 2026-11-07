import { HttpError } from '../utils/httpError.js';
import { toPublicProfile } from '../utils/publicProfile.js';
import { toPublicUser } from '../utils/publicUser.js';

const DUPLICATE_KEY_CODE = 11000;

export function createProfileService({ profileRepository, userRepository }) {
  return {
    async get(userId) {
      return toPublicProfile(await profileRepository.findByUserId(userId));
    },

    async savePreferences(userId, values) {
      let doc;
      try {
        doc = await profileRepository.upsert(userId, values);
      } catch (err) {
        // Two simultaneous first saves can both try to create the document; the unique index
        // rejects one, and a single retry then updates the winner's document.
        if (err?.code !== DUPLICATE_KEY_CODE) throw err;
        doc = await profileRepository.upsert(userId, values);
      }
      return toPublicProfile(doc);
    },

    async updateName(userId, name) {
      const user = await userRepository.updateName(userId, name);
      if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Please log in to continue.');
      return toPublicUser(user);
    },
  };
}
