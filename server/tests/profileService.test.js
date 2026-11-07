import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createProfileController } from '../controllers/profileController.js';
import { createProfileService } from '../services/profileService.js';
import { HttpError } from '../utils/httpError.js';

// These tests use small in-file fakes and import no web or database packages, so they run anywhere.
function fakeProfileRepository({ failFirstWithDuplicate = 0, failWith } = {}) {
  const profiles = new Map();
  let upserts = 0;
  let duplicatesLeft = failFirstWithDuplicate;
  return {
    profiles,
    get upserts() {
      return upserts;
    },
    async findByUserId(userId) {
      return profiles.get(String(userId)) ?? null;
    },
    async upsert(userId, values) {
      upserts += 1;
      if (failWith) throw failWith;
      if (duplicatesLeft > 0) {
        duplicatesLeft -= 1;
        throw Object.assign(new Error('E11000'), { code: 11000 });
      }
      const doc = { _id: `p-${userId}`, user: String(userId), ...structuredClone(values), updatedAt: new Date('2026-11-07') };
      profiles.set(String(userId), doc);
      return doc;
    },
  };
}

function fakeUserRepository() {
  const users = new Map([['u1', { id: 'u1', name: 'Asha Rao', email: 'asha@example.com', passwordHash: 'secret-hash', createdAt: new Date('2026-11-01') }]]);
  return {
    async updateName(id, name) {
      const user = users.get(String(id));
      if (!user) return null;
      user.name = name;
      return user;
    },
  };
}

const prefs = {
  dietaryPreference: 'vegan',
  nutrientPreferences: [{ nutrient: 'sugar', goal: 'lower', weight: 2 }],
  allergens: ['milk'],
  customAllergens: ['Mustard'],
};

function setup(repoOptions) {
  const profileRepository = fakeProfileRepository(repoOptions);
  const userRepository = fakeUserRepository();
  const profileService = createProfileService({ profileRepository, userRepository });
  return { profileRepository, userRepository, profileService, controller: createProfileController({ profileService }) };
}

function fakeRes() {
  return {
    body: undefined,
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function rejection(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return undefined;
}

describe('profileService', () => {
  it('returns the empty default for a user with no profile', async () => {
    const { profileService } = setup();
    const profile = await profileService.get('u1');
    assert.equal(profile.isConfigured, false);
    assert.deepEqual(profile.nutrientPreferences, []);
  });

  it('saves, then replaces, and only ever exposes public fields', async () => {
    const { profileService, profileRepository } = setup();
    const first = await profileService.savePreferences('u1', prefs);
    assert.equal(first.isConfigured, true);
    assert.equal(first.dietaryPreference, 'vegan');
    assert.equal(first.user, undefined);
    assert.equal(first._id, undefined);

    const second = await profileService.savePreferences('u1', { ...prefs, allergens: [], customAllergens: [] });
    assert.deepEqual(second.allergens, []);
    assert.equal(profileRepository.profiles.size, 1);
  });

  it('retries once when two first saves collide on the unique index', async () => {
    const { profileService, profileRepository } = setup({ failFirstWithDuplicate: 1 });
    const saved = await profileService.savePreferences('u1', prefs);
    assert.equal(saved.isConfigured, true);
    assert.equal(profileRepository.upserts, 2);
  });

  it('gives up after one retry and does not hide other errors', async () => {
    const twice = setup({ failFirstWithDuplicate: 2 });
    assert.equal((await rejection(twice.profileService.savePreferences('u1', prefs))).code, 11000);
    assert.equal(twice.profileRepository.upserts, 2);

    const other = setup({ failWith: new Error('database down') });
    assert.match((await rejection(other.profileService.savePreferences('u1', prefs))).message, /database down/);
    assert.equal(other.profileRepository.upserts, 1);
  });

  it('renames a user and never returns the password hash', async () => {
    const { profileService } = setup();
    const user = await profileService.updateName('u1', 'Asha R. Rao');
    assert.deepEqual(Object.keys(user).sort(), ['createdAt', 'email', 'id', 'name']);
    assert.equal(user.name, 'Asha R. Rao');
    assert.equal(JSON.stringify(user).includes('secret-hash'), false);
  });

  it('answers 401 when the user to rename no longer exists', async () => {
    const { profileService } = setup();
    const error = await rejection(profileService.updateName('missing', 'Someone'));
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 401);
  });
});

describe('profileController', () => {
  it('GET returns the profile and the options for the signed-in user only', async () => {
    const { controller, profileService } = setup();
    await profileService.savePreferences('u1', prefs);

    const mine = fakeRes();
    await controller.get({ user: { id: 'u1' } }, mine);
    assert.equal(mine.body.profile.dietaryPreference, 'vegan');
    assert.equal(mine.body.options.nutrients.length, 7);
    assert.equal(mine.body.options.allergens.length, 10);

    const theirs = fakeRes();
    await controller.get({ user: { id: 'u2' } }, theirs);
    assert.equal(theirs.body.profile.isConfigured, false);
    assert.deepEqual(theirs.body.profile.allergens, []);
  });

  it('PUT saves only the validated fields, for req.user.id, ignoring anything else in the body', async () => {
    const { controller, profileRepository } = setup();
    const res = fakeRes();
    await controller.savePreferences(
      { user: { id: 'u1' }, body: { ...prefs, user: 'u2', _id: 'forced', isConfigured: false } },
      res,
    );
    assert.equal(res.body.profile.isConfigured, true);
    const stored = profileRepository.profiles.get('u1');
    assert.equal(stored.user, 'u1');
    assert.equal(profileRepository.profiles.has('u2'), false);
    assert.deepEqual(Object.keys(stored).sort(), [
      '_id',
      'allergens',
      'customAllergens',
      'dietaryPreference',
      'nutrientPreferences',
      'updatedAt',
      'user',
    ]);
  });

  it('PUT with invalid data throws a 400 with field details and saves nothing', async () => {
    const { controller, profileRepository } = setup();
    const error = await rejection(
      controller.savePreferences(
        { user: { id: 'u1' }, body: { ...prefs, dietaryPreference: 'keto', customAllergens: ['ab', 'Peanut'] } },
        fakeRes(),
      ),
    );
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 400);
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.deepEqual(Object.keys(error.details).sort(), ['customAllergens.0', 'customAllergens.1', 'dietaryPreference']);
    assert.equal(profileRepository.upserts, 0);
  });

  it('PATCH validates the name and returns the updated public user', async () => {
    const { controller } = setup();
    const bad = await rejection(controller.updateName({ user: { id: 'u1' }, body: { name: 'A' } }, fakeRes()));
    assert.equal(bad.status, 400);
    assert.ok(bad.details.name);

    const res = fakeRes();
    await controller.updateName({ user: { id: 'u1' }, body: { name: '  New   Name ', email: 'evil@example.com' } }, res);
    assert.equal(res.body.user.name, 'New Name');
    assert.equal(res.body.user.email, 'asha@example.com');
    assert.equal(JSON.stringify(res.body).includes('secret-hash'), false);
  });
});
