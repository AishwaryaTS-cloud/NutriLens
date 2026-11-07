import mongoose from 'mongoose';
import {
  ALLERGEN_KEYS,
  CUSTOM_ALLERGEN_LIMITS,
  CUSTOM_ALLERGEN_PATTERN,
  DEFAULT_DIETARY_PREFERENCE,
  DIETARY_KEYS,
  GOALS,
  NUTRIENTS,
  NUTRIENT_KEYS,
  WEIGHT,
} from '../config/nutrition.js';
import { allergenKey } from '../utils/profileValidators.js';

const nutrientPreferenceSchema = new mongoose.Schema(
  {
    nutrient: { type: String, enum: NUTRIENT_KEYS, required: true },
    goal: { type: String, enum: GOALS, required: true },
    weight: {
      type: Number,
      required: true,
      min: WEIGHT.min,
      max: WEIGHT.max,
      validate: { validator: Number.isInteger, message: 'weight must be a whole number' },
    },
  },
  { _id: false },
);

const allUnique = (items) => new Set(items).size === items.length;

/**
 * Profile: one document per user, created on the first save. The API validates input first;
 * these schema rules are a second line of defence for anything that reaches the database.
 */
const profileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    dietaryPreference: { type: String, enum: DIETARY_KEYS, required: true, default: DEFAULT_DIETARY_PREFERENCE },
    nutrientPreferences: {
      type: [nutrientPreferenceSchema],
      default: [],
      validate: [
        { validator: (items) => items.length <= NUTRIENTS.length, message: 'too many nutrient preferences' },
        { validator: (items) => allUnique(items.map((item) => item.nutrient)), message: 'duplicate nutrient' },
      ],
    },
    allergens: {
      type: [{ type: String, enum: ALLERGEN_KEYS }],
      default: [],
      validate: [
        { validator: (items) => items.length <= ALLERGEN_KEYS.length, message: 'too many allergens' },
        { validator: allUnique, message: 'duplicate allergen' },
      ],
    },
    customAllergens: {
      type: [
        {
          type: String,
          trim: true,
          minlength: CUSTOM_ALLERGEN_LIMITS.minLength,
          maxlength: CUSTOM_ALLERGEN_LIMITS.maxLength,
          match: CUSTOM_ALLERGEN_PATTERN,
        },
      ],
      default: [],
      validate: [
        { validator: (items) => items.length <= CUSTOM_ALLERGEN_LIMITS.maxEntries, message: 'too many custom allergens' },
        { validator: (items) => allUnique(items.map(allergenKey)), message: 'duplicate custom allergen' },
      ],
    },
  },
  { timestamps: true },
);

export const Profile = mongoose.models.Profile || mongoose.model('Profile', profileSchema);
