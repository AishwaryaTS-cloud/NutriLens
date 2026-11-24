import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import mongoose from 'mongoose';
import { AuthNonce } from '../models/AuthNonce.js';
import { OtpChallenge } from '../models/OtpChallenge.js';
import { User } from '../models/User.js';
import { createNonceRepository, createOtpRepository } from '../services/otpRepository.js';
import { createUserRepository } from '../services/userRepository.js';

/**
 * Real-MongoDB checks for the email-code and Google collections: the unique and TTL indexes, and
 * the atomic operations that make a code single-use and cap the attempts under concurrency.
 * They run only when TEST_MONGODB_URI is set and its database name ends in "_test" (the database
 * is dropped afterwards). Example: TEST_MONGODB_URI=mongodb://127.0.0.1:27018/nutrilens_test
 * NOTE: these could not be run in the environment where this feature was written.
 */
const uri = process.env.TEST_MONGODB_URI;
const dbName = uri ? new URL(uri.replace('mongodb+srv://', 'mongodb://')).pathname.slice(1) : '';
const enabled = Boolean(uri) && dbName.endsWith('_test');
const skip = enabled ? false : 'set TEST_MONGODB_URI to a database whose name ends in _test to run these';

describe('email-code collections with a real MongoDB', { skip }, () => {
  const otp = createOtpRepository();
  const nonces = createNonceRepository();
  const users = createUserRepository();
  const base = { email: 'a@example.com', purpose: 'login', codeHash: 'h'.repeat(64) };
  const future = () => new Date(Date.now() + 5 * 60_000);

  before(async () => {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    await Promise.all([User.init(), OtpChallenge.init(), AuthNonce.init()]);
  });
  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('has a unique (email, purpose) index, a TTL index on expiresAt, and a unique nonce hash', async () => {
    const indexes = await OtpChallenge.collection.indexes();
    assert.ok(indexes.some((i) => i.unique && i.key.email === 1 && i.key.purpose === 1));
    assert.ok(indexes.some((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0));
    const nonceIndexes = await AuthNonce.collection.indexes();
    assert.ok(nonceIndexes.some((i) => i.unique && i.key.nonceHash === 1));
    assert.ok(nonceIndexes.some((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0));
  });

  it('upsert keeps one challenge per (email, purpose) and a new code resets the attempts', async () => {
    const now = new Date();
    await otp.upsert({ ...base, now, expiresAt: future() });
    await otp.incrementAttempts({ email: base.email, purpose: 'login', now, max: 5 });
    await otp.upsert({ ...base, codeHash: 'n'.repeat(64), now, expiresAt: future() });
    assert.equal(await OtpChallenge.countDocuments({ email: base.email, purpose: 'login' }), 1);
    assert.equal((await otp.find(base.email, 'login')).attempts, 0);
    await otp.remove(base.email, 'login');
  });

  it('simultaneous first upserts do not throw (the duplicate-key race is handled)', async () => {
    const now = new Date();
    await Promise.all(Array.from({ length: 8 }, () => otp.upsert({ ...base, email: 'race@example.com', now, expiresAt: future() })));
    assert.equal(await OtpChallenge.countDocuments({ email: 'race@example.com' }), 1);
  });

  it('caps attempts atomically: 25 parallel guesses are counted exactly five times', async () => {
    const now = new Date();
    await otp.upsert({ ...base, email: 'cap@example.com', now, expiresAt: future() });
    const results = await Promise.all(Array.from({ length: 25 }, () => otp.incrementAttempts({ email: 'cap@example.com', purpose: 'login', now, max: 5 })));
    assert.equal(results.filter(Boolean).length, 5);
    assert.equal((await otp.find('cap@example.com', 'login')).attempts, 5);
  });

  it('does not count attempts on an expired challenge', async () => {
    const now = new Date();
    await otp.upsert({ ...base, email: 'old@example.com', now, expiresAt: new Date(now.getTime() - 1000) });
    assert.equal(await otp.incrementAttempts({ email: 'old@example.com', purpose: 'login', now, max: 5 }), null);
  });

  it('consumes a code exactly once, even when ten requests race', async () => {
    const now = new Date();
    const doc = await otp.upsert({ ...base, email: 'once@example.com', now, expiresAt: future() });
    const results = await Promise.all(Array.from({ length: 10 }, () => otp.consume({ id: doc._id, codeHash: base.codeHash })));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(await otp.find('once@example.com', 'login'), null);
  });

  it('refuses to consume with the wrong hash', async () => {
    const doc = await otp.upsert({ ...base, email: 'wrong@example.com', now: new Date(), expiresAt: future() });
    assert.equal(await otp.consume({ id: doc._id, codeHash: 'x'.repeat(64) }), null);
    assert.ok(await otp.find('wrong@example.com', 'login'));
  });

  it('stores sign-up details and the Google link identity inside the challenge', async () => {
    const now = new Date();
    await otp.upsert({ email: 'reg@example.com', purpose: 'register', codeHash: 'h'.repeat(64), now, expiresAt: future(), pending: { name: 'Reg', passwordHash: '$2a$04$x' } });
    await otp.upsert({ email: 'lnk@example.com', purpose: 'link', codeHash: 'h'.repeat(64), now, expiresAt: future(), link: { userId: 'u1', googleId: 'g1' } });
    assert.equal((await otp.find('reg@example.com', 'register')).pending.name, 'Reg');
    assert.equal((await otp.find('lnk@example.com', 'link')).link.googleId, 'g1');
  });

  it('consumes a nonce once, and never an expired one', async () => {
    const now = new Date();
    await nonces.create({ nonceHash: 'a'.repeat(64), expiresAt: future() });
    const results = await Promise.all(Array.from({ length: 6 }, () => nonces.consume({ nonceHash: 'a'.repeat(64), now })));
    assert.equal(results.filter(Boolean).length, 1);
    await nonces.create({ nonceHash: 'b'.repeat(64), expiresAt: new Date(now.getTime() - 1000) });
    assert.equal(await nonces.consume({ nonceHash: 'b'.repeat(64), now }), null);
  });

  it('User: an account made the old way (no new fields) loads with safe defaults', async () => {
    const { insertedId } = await User.collection.insertOne({ name: 'Legacy', email: 'legacy@example.com', passwordHash: '$2a$04$legacy', createdAt: new Date(), updatedAt: new Date() });
    const legacy = await users.findById(String(insertedId));
    assert.equal(legacy.emailVerified, false);
    assert.deepEqual([...legacy.authProviders], []);
    assert.equal(legacy.googleId, undefined);
    const withHash = await users.findByEmail('legacy@example.com');
    assert.equal(withHash.passwordHash, '$2a$04$legacy', 'the old password hash is untouched and still selectable');
  });

  it('User: passwordless accounts are valid, googleId is unique only when present, and it never appears in JSON', async () => {
    const a = await users.create({ name: 'Goog One', email: 'g1@example.com', googleId: 'sub-1', emailVerified: true, authProviders: ['google'] });
    await users.create({ name: 'No Google', email: 'n1@example.com', passwordHash: '$2a$04$x' });
    await users.create({ name: 'No Google 2', email: 'n2@example.com', passwordHash: '$2a$04$x' }); // two accounts with no googleId must coexist
    await assert.rejects(() => users.create({ name: 'Dup', email: 'g2@example.com', googleId: 'sub-1' }), (err) => err.code === 11000);
    assert.equal(a.toJSON().googleId, undefined);
    assert.equal((await users.findByGoogleId('sub-1')).email, 'g1@example.com');
  });

  it('User: linkGoogle and markEmailVerified update the right fields and keep the first verification date', async () => {
    const u = await users.create({ name: 'Link Me', email: 'link@example.com', passwordHash: '$2a$04$x' });
    const linked = await users.linkGoogle(u.id, 'sub-link');
    assert.equal(linked.googleId, 'sub-link');
    assert.equal(linked.emailVerified, true);
    assert.ok(linked.authProviders.includes('google'));
    const first = (await users.markEmailVerified(u.id, 'email_otp')).emailVerifiedAt;
    assert.ok(first instanceof Date);
    const second = (await users.markEmailVerified(u.id, 'email_otp')).emailVerifiedAt;
    assert.equal(second.getTime(), first.getTime());
    const other = await users.create({ name: 'Other', email: 'other@example.com' });
    await assert.rejects(() => users.linkGoogle(other.id, 'sub-link'), (err) => err.code === 11000);
  });
});
