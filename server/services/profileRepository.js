import mongoose from 'mongoose';
import { Profile } from '../models/Profile.js';

/** Data access for profiles. Always scoped by user id; returns plain objects. */
export function createProfileRepository(ProfileModel = Profile) {
  return {
    async findByUserId(userId) {
      if (!mongoose.isValidObjectId(userId)) return null;
      return ProfileModel.findOne({ user: userId }).lean();
    },

    /** Creates the profile on the first save, replaces its preference fields afterwards. */
    async upsert(userId, values) {
      return ProfileModel.findOneAndUpdate(
        { user: userId },
        { $set: values },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      ).lean();
    },
  };
}
