import mongoose from 'mongoose';
import { User } from '../models/User.js';

/**
 * Data access for users. Services depend on this small interface rather than on Mongoose
 * directly, so tests can swap in an in-memory version.
 */
export function createUserRepository(UserModel = User) {
  return {
    /** Includes passwordHash: only the login flow should call this. */
    findByEmail(email) {
      return UserModel.findOne({ email }).select('+passwordHash');
    },
    /** Looks up by Google's stable account id (never by email, which can change). */
    findByGoogleId(googleId) {
      return UserModel.findOne({ googleId });
    },
    async findById(id) {
      if (!mongoose.isValidObjectId(id)) return null;
      return UserModel.findById(id);
    },
    create(data) {
      return UserModel.create(data);
    },
    /** Phase 2: display-name edits. Returns the updated user (without passwordHash) or null. */
    async updateName(id, name) {
      if (!mongoose.isValidObjectId(id)) return null;
      return UserModel.findByIdAndUpdate(id, { $set: { name } }, { new: true, runValidators: true });
    },
    /** Attaches a verified Google identity. The sparse unique index rejects an id used elsewhere (E11000). */
    async linkGoogle(id, googleId) {
      if (!mongoose.isValidObjectId(id)) return null;
      return UserModel.findByIdAndUpdate(
        id,
        { $set: { googleId, emailVerified: true }, $addToSet: { authProviders: 'google' } },
        { new: true },
      );
    },
    /** Records that the user proved they own this inbox. Keeps the first verification date. */
    async markEmailVerified(id, provider) {
      if (!mongoose.isValidObjectId(id)) return null;
      await UserModel.updateOne({ _id: id, emailVerifiedAt: { $exists: false } }, { $set: { emailVerifiedAt: new Date() } });
      return UserModel.findByIdAndUpdate(
        id,
        { $set: { emailVerified: true }, $addToSet: { authProviders: provider } },
        { new: true },
      );
    },
  };
}
