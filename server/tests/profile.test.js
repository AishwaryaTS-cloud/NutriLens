import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TEST_ORIGIN,
  makeTestApp,
  postJson,
  request,
  sendJson,
  signUp,
  validPreferences,
  withServer,
} from './helpers.js';

const getProfile = (url, cookie) => request(url, '/api/profile', { headers: cookie ? { Cookie: cookie } : {} });
const putPrefs = (url, cookie, body, headers = {}) =>
  sendJson('PUT', url, '/api/profile/preferences', body, { ...(cookie ? { Cookie: cookie } : {}), ...headers });
const patchName = (url, cookie, body, headers = {}) =>
  sendJson('PATCH', url, '/api/profile', body, { ...(cookie ? { Cookie: cookie } : {}), ...headers });

const second = { name: 'Ben Carter', email: 'ben@example.com', password: 'Passw0rdOK' };
const empty = { dietaryPreference: 'none', nutrientPreferences: [], allergens: [], customAllergens: [] };

describe('profile API: authentication', () => {
  it('refuses unauthenticated access to every profile endpoint', () =>
    withServer(makeTestApp().app, async (url) => {
      for (const res of [await getProfile(url), await putPrefs(url, null, validPreferences), await patchName(url, null, { name: 'New Name' })]) {
        assert.equal(res.status, 401);
        assert.equal(res.json.error.code, 'UNAUTHENTICATED');
      }
    }));

  it('refuses a request whose user no longer exists', async () => {
    const { app, userRepository } = makeTestApp();
    await withServer(app, async (url) => {
      const { cookie } = await signUp(url);
      userRepository.users.clear();
      assert.equal((await getProfile(url, cookie)).status, 401);
    });
  });
});

describe('GET /api/profile', () => {
  it('returns an empty "not configured" profile plus the options for a new user', () =>
    withServer(makeTestApp().app, async (url) => {
      const { cookie } = await signUp(url);
      const res = await getProfile(url, cookie);
      assert.equal(res.status, 200);
      assert.equal(res.headers['cache-control'], 'no-store');
      assert.deepEqual(res.json.profile, {
        dietaryPreference: 'none',
        nutrientPreferences: [],
        allergens: [],
        customAllergens: [],
        isConfigured: false,
        updatedAt: null,
      });
      const { options } = res.json;
      assert.equal(options.nutrients.length, 7);
      assert.equal(options.allergens.length, 10);
      assert.deepEqual(options.dietaryPreferences.map((d) => d.key), ['vegetarian', 'vegan', 'eggetarian', 'pescatarian', 'none']);
      assert.deepEqual({ ...options.weights }, { min: 1, max: 3 });
      assert.equal(options.customAllergens.maxEntries, 5);
    }));
});

describe('PUT /api/profile/preferences', () => {
  it('saves all four preference groups and returns them', () =>
    withServer(makeTestApp().app, async (url) => {
      const { cookie } = await signUp(url);
      const res = await putPrefs(url, cookie, validPreferences);
      assert.equal(res.status, 200);
      assert.equal(res.json.profile.isConfigured, true);
      assert.equal(res.json.profile.dietaryPreference, 'vegetarian');
      assert.deepEqual(res.json.profile.nutrientPreferences, validPreferences.nutrientPreferences);
      assert.deepEqual(res.json.profile.allergens, ['milk', 'soy']);
      assert.deepEqual(res.json.profile.customAllergens, ['Mustard']);

      const again = await getProfile(url, cookie);
      assert.deepEqual(again.json.profile, res.json.profile);
    }));

  it('replaces the previous preferences on a second save', () =>
    withServer(makeTestApp().app, async (url) => {
      const { cookie } = await signUp(url);
      await putPrefs(url, cookie, validPreferences);
      const next = {
        dietaryPreference: 'vegan',
        nutrientPreferences: [{ nutrient: 'fibre', goal: 'higher', weight: 2 }],
        allergens: ['sesame'],
        customAllergens: [],
      };
      const res = await putPrefs(url, cookie, next);
      assert.deepEqual(
        { ...res.json.profile, updatedAt: null, isConfigured: undefined },
        { ...next, updatedAt: null, isConfigured: undefined },
      );
    }));

  it('accepts a save with nothing selected and counts it as configured', () =>
    withServer(makeTestApp().app, async (url) => {
      const { cookie } = await signUp(url);
      const res = await putPrefs(url, cookie, empty);
      assert.equal(res.status, 200);
      assert.equal(res.json.profile.isConfigured, true);
      assert.deepEqual(res.json.profile.nutrientPreferences, []);
    }));

  it('rejects invalid input with field-keyed details and saves nothing', async () => {
    const { app, profileRepository } = makeTestApp();
    await withServer(app, async (url) => {
      const { cookie } = await signUp(url);
      const res = await putPrefs(url, cookie, {
        dietaryPreference: 'keto',
        nutrientPreferences: [{ nutrient: 'sugar', goal: 'lower', weight: 4 }],
        allergens: ['mustard'],
        customAllergens: ['Mustard', 'ab', '<b>x</b>', 'Peanut'],
      });
      assert.equal(res.status, 400);
      assert.equal(res.json.error.code, 'VALIDATION_ERROR');
      const keys = Object.keys(res.json.error.details).sort();
      assert.deepEqual(keys, [
        'allergens',
        'customAllergens.1',
        'customAllergens.2',
        'customAllergens.3',
        'dietaryPreference',
        'nutrientPreferences.sugar',
      ]);
      assert.equal(profileRepository.profiles.size, 0);
    });
  });

  it('rejects a missing body field instead of guessing a default', () =>
    withServer(makeTestApp().app, async (url) => {
      const { cookie } = await signUp(url);
      const res = await putPrefs(url, cookie, { dietaryPreference: 'vegan' });
      assert.equal(res.status, 400);
      assert.ok(res.json.error.details.nutrientPreferences);
      assert.ok(res.json.error.details.allergens);
      assert.ok(res.json.error.details.customAllergens);
    }));

  it('returns only public fields and ignores attempts to set internal ones', async () => {
    const { app, profileRepository } = makeTestApp();
    await withServer(app, async (url) => {
      const { cookie, user } = await signUp(url);
      const res = await putPrefs(url, cookie, {
        ...validPreferences,
        user: 'someone-else',
        _id: 'forced',
        isConfigured: false,
        updatedAt: '1999-01-01',
      });
      assert.equal(res.status, 200);
      assert.doesNotMatch(res.text, /"_id"|"user"|__v/);
      assert.deepEqual(Object.keys(res.json.profile).sort(), [
        'allergens',
        'customAllergens',
        'dietaryPreference',
        'isConfigured',
        'nutrientPreferences',
        'updatedAt',
      ]);
      const stored = [...profileRepository.profiles.values()][0];
      assert.equal(stored.user, user.id);
      assert.notEqual(stored._id, 'forced');
    });
  });

  it('keeps one profile document per user across repeated saves', async () => {
    const { app, profileRepository } = makeTestApp();
    await withServer(app, async (url) => {
      const { cookie } = await signUp(url);
      await putPrefs(url, cookie, validPreferences);
      await putPrefs(url, cookie, empty);
      assert.equal(profileRepository.profiles.size, 1);
    });
  });
});

describe('profile API: each user only sees their own data', () => {
  it('keeps two accounts completely separate', () =>
    withServer(makeTestApp().app, async (url) => {
      const a = await signUp(url);
      const b = await signUp(url, second);
      await putPrefs(url, a.cookie, validPreferences);

      const seenByB = await getProfile(url, b.cookie);
      assert.equal(seenByB.json.profile.isConfigured, false);
      assert.deepEqual(seenByB.json.profile.allergens, []);

      await putPrefs(url, b.cookie, { ...empty, dietaryPreference: 'vegan', allergens: ['fish'] });
      const seenByA = await getProfile(url, a.cookie);
      assert.equal(seenByA.json.profile.dietaryPreference, 'vegetarian');
      assert.deepEqual(seenByA.json.profile.allergens, ['milk', 'soy']);
    }));

  it('keeps data after logging out and back in', () =>
    withServer(makeTestApp().app, async (url) => {
      const { cookie } = await signUp(url);
      await putPrefs(url, cookie, validPreferences);
      await postJson(url, '/api/auth/logout', {}, { Cookie: cookie });
      const login = await postJson(url, '/api/auth/login', { email: 'asha@example.com', password: 'Passw0rdOK' });
      const newCookie = login.headers['set-cookie'][0].split(';')[0];
      const res = await getProfile(url, newCookie);
      assert.deepEqual(res.json.profile.allergens, ['milk', 'soy']);
    }));
});

describe('PATCH /api/profile (display name)', () => {
  it('updates the name, and /api/auth/me shows it', () =>
    withServer(makeTestApp().app, async (url) => {
      const { cookie } = await signUp(url);
      const res = await patchName(url, cookie, { name: '  Asha   R. Rao ' });
      assert.equal(res.status, 200);
      assert.equal(res.json.user.name, 'Asha R. Rao');
      assert.equal(res.json.user.email, 'asha@example.com');
      assert.doesNotMatch(res.text, /password|\$2[aby]\$/i);

      const me = await request(url, '/api/auth/me', { headers: { Cookie: cookie } });
      assert.equal(me.json.user.name, 'Asha R. Rao');
    }));

  it('rejects invalid names with a field error', () =>
    withServer(makeTestApp().app, async (url) => {
      const { cookie } = await signUp(url);
      for (const bad of ['A', '', '   ', 'x'.repeat(61), 5, null]) {
        const res = await patchName(url, cookie, { name: bad });
        assert.equal(res.status, 400, String(bad));
        assert.ok(res.json.error.details.name);
      }
      const me = await request(url, '/api/auth/me', { headers: { Cookie: cookie } });
      assert.equal(me.json.user.name, 'Asha Rao');
    }));

  it('cannot be used to change the email or anything else', () =>
    withServer(makeTestApp().app, async (url) => {
      const { cookie } = await signUp(url);
      const res = await patchName(url, cookie, { name: 'New Name', email: 'evil@example.com', passwordHash: 'x', id: 'other' });
      assert.equal(res.status, 200);
      assert.equal(res.json.user.email, 'asha@example.com');
      assert.notEqual(res.json.user.id, 'other');
    }));

  it('only renames the signed-in user', () =>
    withServer(makeTestApp().app, async (url) => {
      const a = await signUp(url);
      const b = await signUp(url, second);
      await patchName(url, a.cookie, { name: 'Renamed Person' });
      const meB = await request(url, '/api/auth/me', { headers: { Cookie: b.cookie } });
      assert.equal(meB.json.user.name, 'Ben Carter');
    }));
});

describe('profile API: request protections', () => {
  it('blocks state-changing requests from another origin (CSRF) and saves nothing', async () => {
    const { app, profileRepository, userRepository } = makeTestApp();
    await withServer(app, async (url) => {
      const { cookie } = await signUp(url);
      const evil = { Origin: 'https://evil.example' };

      const put = await putPrefs(url, cookie, validPreferences, evil);
      assert.equal(put.status, 403);
      assert.equal(put.json.error.code, 'FORBIDDEN_ORIGIN');
      assert.equal(profileRepository.profiles.size, 0);

      const patch = await patchName(url, cookie, { name: 'Hacked Name' }, evil);
      assert.equal(patch.status, 403);
      assert.equal([...userRepository.users.values()][0].name, 'Asha Rao');
    });
  });

  it('accepts the configured client origin and answers its preflight', () =>
    withServer(makeTestApp().app, async (url) => {
      const { cookie } = await signUp(url);
      const ok = await putPrefs(url, cookie, validPreferences, { Origin: TEST_ORIGIN });
      assert.equal(ok.status, 200);
      assert.equal(ok.headers['access-control-allow-origin'], TEST_ORIGIN);

      const preflight = await request(url, '/api/profile/preferences', {
        method: 'OPTIONS',
        headers: { Origin: TEST_ORIGIN, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' },
      });
      assert.equal(preflight.status, 204);
      assert.match(preflight.headers['access-control-allow-methods'], /PUT/);
    }));

  it('answers malformed JSON with the error envelope', () =>
    withServer(makeTestApp().app, async (url) => {
      const { cookie } = await signUp(url);
      const res = await request(url, '/api/profile/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: '{not json',
      });
      assert.equal(res.status, 400);
      assert.equal(res.json.error.code, 'INVALID_JSON');
    }));
});
