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
    // Optional: accounts created with Google (or only ever used with email codes) have no password.
    passwordHash: { type: String, select: false },
    // Existing accounts have none of the fields below. Mongoose applies these defaults when it
    // loads them, so every old user simply reads as "email not verified yet" with no migration.
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date },
    // Google's stable account id (the ID token "sub"). Unique when present; absent for everyone else.
    googleId: { type: String, unique: true, sparse: true },
    authProviders: { type: [String], default: [] }, // informational: 'password', 'email_otp', 'google'
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.googleId;
        return ret;
      },
    },
  },
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
