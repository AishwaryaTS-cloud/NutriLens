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
    async findById(id) {
      if (!mongoose.isValidObjectId(id)) return null;
      return UserModel.findById(id);
    },
    create(data) {
      return UserModel.create(data);
    },
  };
}
