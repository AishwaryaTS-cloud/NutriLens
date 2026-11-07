import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    email: {
      type: String,
      required: true,
      unique: true, // enforced by a MongoDB unique index (see User.init() in server.js)
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    // select:false keeps the hash out of every query unless it is asked for explicitly.
    passwordHash: { type: String, required: true, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
