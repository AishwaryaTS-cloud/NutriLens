import { PROFILE_OPTIONS } from '../config/nutrition.js';
import { HttpError } from '../utils/httpError.js';
import { validatePreferences } from '../utils/profileValidators.js';
import { validateName } from '../utils/validators.js';

function validationError(errors) {
  return new HttpError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.', errors);
}

/** Every handler works on req.user.id, set by the auth middleware: users only ever touch their own data. */
export function createProfileController({ profileService }) {
  return {
    async get(req, res) {
      const profile = await profileService.get(req.user.id);
      res.json({ profile, options: PROFILE_OPTIONS });
    },

    async savePreferences(req, res) {
      const input = validatePreferences(req.body);
      if (!input.valid) throw validationError(input.errors);
      const profile = await profileService.savePreferences(req.user.id, input.value);
      res.json({ profile });
    },

    async updateName(req, res) {
      const input = validateName(req.body);
      if (!input.valid) throw validationError(input.errors);
      const user = await profileService.updateName(req.user.id, input.value.name);
      res.json({ user });
    },
  };
}
