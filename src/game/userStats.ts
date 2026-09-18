import { UserStats } from '../models/UserStats.js';

// Permanent win count — called on every standalone game win AND every
// session round win, per spec's totalboard including both.
export async function recordWin(groupId: string, userId: string): Promise<void> {
  await UserStats.updateOne(
    { groupId, userId },
    { $inc: { totalWins: 1 } },
    { upsert: true },
  );
}

// Tracks this player's single longest word ever accepted, across every
// game/round they've ever played in this group — independent of
// whether they won. Only overwrites the record if this word is
// strictly longer than what's already stored.
export async function recordWordIfLongest(
  groupId: string,
  userId: string,
  word: string,
): Promise<void> {
  // Read-then-write rather than a single conditional upsert: a combined
  // $or + upsert filter didn't reliably match an existing document that
  // already had a longestWordEver value from a prior recordWin() upsert,
  // causing a duplicate-key crash (real bug, caught via testing). Safe
  // here without an atomic claim — a single player only ever has one
  // word in flight at a time (their own current turn), so there's no
  // real race to guard against, unlike turn resolution.
  const existing = await UserStats.findOne({ groupId, userId }).lean();
  const currentLength = existing?.longestWordEver?.length ?? 0;
  if (word.length <= currentLength) return;

  await UserStats.updateOne(
    { groupId, userId },
    { $set: { longestWordEver: { word, length: word.length } } },
    { upsert: true },
  );
}

export interface TotalboardEntry {
  userId: string;
  totalWins: number;
  longestWord: string;
  longestWordLength: number;
}

export async function getTotalboardData(
  groupId: string,
): Promise<TotalboardEntry[]> {
  const docs = await UserStats.find({ groupId }).lean();

  return docs.map((doc) => ({
    userId: doc.userId,
    totalWins: doc.totalWins,
    longestWord: doc.longestWordEver?.word ?? '',
    longestWordLength: doc.longestWordEver?.length ?? 0,
  }));
}
