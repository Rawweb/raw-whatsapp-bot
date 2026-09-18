import mongoose, { Schema } from 'mongoose';

interface LongestWordEver {
  word: string;
  length: number;
}

// All-time, per-user, per-group stats — never reset by a session or
// game ending, unlike everything in Group.ts's activeGame. One document
// per (userId, groupId) pair, since stats are tracked per-group per spec.
export interface UserStatsDoc {
  userId: string;
  groupId: string;
  totalWins: number;
  longestWordEver: LongestWordEver;
}

const longestWordEverSchema = new Schema<LongestWordEver>(
  {
    word: { type: String, default: '' },
    length: { type: Number, default: 0 },
  },
  { _id: false },
);

const userStatsSchema = new Schema<UserStatsDoc>({
  userId: { type: String, required: true },
  groupId: { type: String, required: true },
  totalWins: { type: Number, default: 0 },
  longestWordEver: { type: longestWordEverSchema, default: () => ({}) },
});

// One stats document per player per group — never two
userStatsSchema.index({ userId: 1, groupId: 1 }, { unique: true });

export const UserStats = mongoose.model<UserStatsDoc>(
  'UserStats',
  userStatsSchema,
);
