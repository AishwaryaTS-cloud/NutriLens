import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { createUserRepository } from '../services/userRepository.js';

/**
 * Real-MongoDB checks (unique index, hidden hash). They run only when TEST_MONGODB_URI is set
 * and its database name ends in "_test", because the suite drops that database afterwards.
 * Example: TEST_MONGODB_URI=mongodb://127.0.0.1:27018/nutrilens_test npm test -w server
 */
const uri = process.env.TEST_MONGODB_URI;
const dbName = uri ? new URL(uri.replace('mongodb+srv://', 'mongodb://')).pathname.slice(1) : '';
const enabled = Boolean(uri) && dbName.endsWith('_test');
const skip = enabled ? false : 'set TEST_MONGODB_URI to a database whose name ends in _test to run these';

describe('User model with a real MongoDB', { skip }, () => {
  const repository = createUserRepository();

  before(async () => {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    await User.init(); // builds the unique email index
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('enforces a unique email at the database level', async () => {
    await repository.create({ name: 'Asha Rao', email: 'a@example.com', passwordHash: '$2a$04$hash' });
    await assert.rejects(
      () => repository.create({ name: 'Other', email: 'a@example.com', passwordHash: '$2a$04$hash' }),
      (err) => err.code === 11000,
    );
  });

  it('lowercases emails and keeps the hash out of normal queries and JSON', async () => {
    const created = await repository.create({ name: 'Ben', email: 'Ben@Example.com', passwordHash: '$2a$04$hash' });
    assert.equal(created.email, 'ben@example.com');
    assert.equal(created.toJSON().passwordHash, undefined);

    const plain = await repository.findById(created.id);
    assert.equal(plain.passwordHash, undefined);
    const withHash = await repository.findByEmail('ben@example.com');
    assert.equal(withHash.passwordHash, '$2a$04$hash');
  });

  it('returns null for malformed ids instead of throwing', async () => {
    assert.equal(await repository.findById('not-an-object-id'), null);
  });
});
