import mongoose from 'mongoose';
import { Scan } from '../models/Scan.js';

const SUMMARY_FIELDS = 'productName brand finalScore status allergenConflict allergenStatus createdAt';

/** Data access for saved scans. Every query is scoped by user id, so users never reach each other's scans. */
export function createScanRepository(ScanModel = Scan) {
  const valid = (id) => mongoose.isValidObjectId(id);
  return {
    async create(userId, doc) {
      const created = await ScanModel.create({ ...doc, user: userId });
      return created.toObject();
    },
    async listByUser(userId, limit = 200) {
      if (!valid(userId)) return [];
      return ScanModel.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).select(SUMMARY_FIELDS).lean();
    },
    async countByUser(userId) {
      return valid(userId) ? ScanModel.countDocuments({ user: userId }) : 0;
    },
    async findById(userId, id) {
      if (!valid(userId) || !valid(id)) return null;
      return ScanModel.findOne({ _id: id, user: userId }).lean();
    },
    async deleteById(userId, id) {
      if (!valid(userId) || !valid(id)) return false;
      const result = await ScanModel.deleteOne({ _id: id, user: userId });
      return result.deletedCount === 1;
    },
  };
}
