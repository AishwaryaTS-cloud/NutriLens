import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import mongoose from 'mongoose';
import { Profile } from '../models/Profile.js';
import { User } from '../models/User.js';
import { createProfileRepository } from '../services/profileRepository.js';
import { createUserRepository } from '../services/userRepository.js';

const userId = () => new mongoose.Types.ObjectId();
const valid = (extra = {}) => ({ user: userId(), dietaryPreference: 'none', ...extra });
const problems = (doc) => Object.keys(doc.validateSync()?.errors ?? {});

// ---- Schema rules: no database connection needed ----
describe('Profile schema validation (no database needed)', () => {
  it('accepts a complete valid profile', () => {
    const doc = new Profile(
      valid({
        dietaryPreference: 'eggetarian',
        nutrientPreferences: [{ nutrient: 'sugar', goal: 'lower', weight: 3 }],
        allergens: ['milk', 'sesame'],
        customAllergens: ['Mustard'],
      }),
    );
    assert.equal(doc.validateSync(), undefined);
  });

  it('defaults to "No specific preference" with empty lists', () => {
    const doc = new Profile({ user: userId() });
    assert.equal(doc.dietaryPreference, 'none');
    assert.deepEqual([doc.nutrientPreferences.length, doc.allergens.length, doc.customAllergens.length], [0, 0, 0]);
    assert.equal(doc.validateSync(), undefined);
  });

  it('requires a user and rejects an unknown dietary preference', () => {
    assert.ok(problems(new Profile({ dietaryPreference: 'none' })).includes('user'));
    assert.ok(problems(new Profile(valid({ dietaryPreference: 'keto' }))).includes('dietaryPreference'));
  });

  it('rejects bad nutrient entries: unknown nutrient, goal, weight 0/4/2.5, duplicates, more than seven', () => {
    const bad = [
      [{ nutrient: 'calories', goal: 'lower', weight: 1 }],
      [{ nutrient: 'sugar', goal: 'middle', weight: 1 }],
      [{ nutrient: 'sugar', goal: 'lower', weight: 0 }],
      [{ nutrient: 'sugar', goal: 'lower', weight: 4 }],
      [{ nutrient: 'sugar', goal: 'lower', weight: 2.5 }],
      [{ nutrient: 'sugar', goal: 'lower', weight: 1 }, { nutrient: 'sugar', goal: 'higher', weight: 2 }],
      Array.from({ length: 8 }, () => ({ nutrient: 'sugar', goal: 'lower', weight: 1 })),
    ];
    for (const nutrientPreferences of bad) {
      assert.ok(problems(new Profile(valid({ nutrientPreferences }))).length > 0, JSON.stringify(nutrientPreferences));
    }
  });

  it('rejects unknown and duplicate predefined allergens', () => {
    assert.ok(problems(new Profile(valid({ allergens: ['mustard'] }))).length > 0);
    assert.ok(problems(new Profile(valid({ allergens: ['milk', 'milk'] }))).includes('allergens'));
  });

  it('enforces the custom-allergen rules at schema level', () => {
    const bad = [['ab'], ['a'.repeat(41)], ['<b>x</b>'], ['Mustard', 'mustard'], ['One1', 'Two2', 'Three', 'Four4', 'Five5', 'Six66']];
    for (const customAllergens of bad) {
      assert.ok(problems(new Profile(valid({ customAllergens }))).length > 0, JSON.stringify(customAllergens));
    }
    assert.equal(new Profile(valid({ customAllergens: ['Kiwi fruit', 'Ragi'] })).validateSync(), undefined);
  });
});

// ---- Real MongoDB: runs only when TEST_MONGODB_URI points at a database whose name ends in _test ----
const uri = process.env.TEST_MONGODB_URI;
const dbName = uri ? new URL(uri.replace('mongodb+srv://', 'mongodb://')).pathname.slice(1) : '';
const enabled = Boolean(uri) && dbName.endsWith('_test');
const skip = enabled ? false : 'set TEST_MONGODB_URI to a database whose name ends in _test to run these';

describe('Profile with a real MongoDB', { skip }, () => {
  const profiles = createProfileRepository();
  const users = createUserRepository();

  before(async () => {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    await User.init();
    await Profile.init(); // builds the unique index on `user`
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('allows only one profile per user (unique index)', async () => {
    const user = userId();
    await Profile.create({ user });
    await assert.rejects(() => Profile.create({ user }), (err) => err.code === 11000);
  });

  it('creates the profile on first save and replaces it afterwards, keeping a single document', async () => {
    const user = userId();
    assert.equal(await profiles.findByUserId(user), null);

    const first = await profiles.upsert(user, {
      dietaryPreference: 'vegan',
      nutrientPreferences: [{ nutrient: 'sugar', goal: 'lower', weight: 2 }],
      allergens: ['milk'],
      customAllergens: ['Mustard'],
    });
    assert.equal(first.dietaryPreference, 'vegan');

    const second = await profiles.upsert(user, {
      dietaryPreference: 'none',
      nutrientPreferences: [],
      allergens: [],
      customAllergens: [],
    });
    assert.deepEqual(second.allergens, []);
    assert.equal(await Profile.countDocuments({ user }), 1);
    assert.equal(String(second._id), String(first._id));
  });

  it('runs schema validation on updates too', async () => {
    await assert.rejects(
      () =>
        profiles.upsert(userId(), {
          dietaryPreference: 'keto',
          nutrientPreferences: [],
          allergens: [],
          customAllergens: [],
        }),
      (err) => err.name === 'ValidationError',
    );
  });

  it('returns null for malformed user ids instead of throwing', async () => {
    assert.equal(await profiles.findByUserId('not-an-object-id'), null);
  });

  it('renames a user through the user repository and validates the length', async () => {
    const created = await User.create({ name: 'Asha Rao', email: 'rename@example.com', passwordHash: '$2a$04$hash' });
    const updated = await users.updateName(created.id, 'Asha R. Rao');
    assert.equal(updated.name, 'Asha R. Rao');
    assert.equal(updated.passwordHash, undefined);
    assert.equal(await users.updateName('not-an-object-id', 'Whoever'), null);
    await assert.rejects(() => users.updateName(created.id, 'A'), (err) => err.name === 'ValidationError');
  });
});
