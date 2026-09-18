import mongoose, { Schema } from 'mongoose';

export type GamePhase = 'lobby' | 'in_progress';

// Win counts, keyed by player. Stored as an array of {userId, wins}
// rather than a Mongoose Map, because real WhatsApp JIDs contain a "."
// (e.g. "...@s.whatsapp.net") and Mongoose's Map type rejects any key
// containing one.
interface SessionWinEntry {
  userId: string;
  wins: number;
}

interface ActiveGame {
  isSession: boolean;
  currentRound: number;
  isActive: boolean;
  phase: GamePhase;
  // Random ID assigned each time a lobby opens. Lets a scheduled timer
  // (set when the lobby opened) tell whether it's still talking about
  // the *same* lobby, or a stale one from a game that was since ended
  // and restarted — without this, an old timer could fire against a
  // brand-new lobby and close it early.
  lobbyToken: string;
  // Phone number of the admin who ran .raw start — only they can .raw end it
  startedBy: string;
  playerQueue: string[];
  currentTurnIndex: number;
  eliminated: string[];
  wordsUsedThisRound: string[];
  totalWordsThisRound: number;
  // Which turn/prompt we're on this round (1-indexed) — feeds
  // getDifficultyForTurn() to derive the current letter-count/time-limit
  // rather than storing a pre-computed "level" directly
  turnNumber: number;
  // The letter the CURRENT turn's word must start with
  currentLetter: string;
  sessionWinCounts: SessionWinEntry[];
}

interface LastCompletedSessionSnapshot {
  roundReached: number;
  finalStandings: SessionWinEntry[];
  endedWithWinner: boolean;
  endedAt: Date;
}

export interface GroupDoc {
  groupId: string;
  activeGame: ActiveGame;
  lastCompletedSessionSnapshot?: LastCompletedSessionSnapshot;
}

const sessionWinEntrySchema = new Schema<SessionWinEntry>(
  {
    userId: { type: String, required: true },
    wins: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const activeGameSchema = new Schema<ActiveGame>(
  {
    isSession: { type: Boolean, default: false },
    currentRound: { type: Number, default: 1 },
    isActive: { type: Boolean, default: false },
    phase: { type: String, enum: ['lobby', 'in_progress'], default: 'lobby' },
    lobbyToken: { type: String, default: '' },
    startedBy: { type: String, default: '' },
    playerQueue: { type: [String], default: [] },
    currentTurnIndex: { type: Number, default: 0 },
    eliminated: { type: [String], default: [] },
    wordsUsedThisRound: { type: [String], default: [] },
    totalWordsThisRound: { type: Number, default: 0 },
    turnNumber: { type: Number, default: 0 },
    currentLetter: { type: String, default: '' },
    sessionWinCounts: { type: [sessionWinEntrySchema], default: [] },
  },
  { _id: false },
);

const lastCompletedSessionSnapshotSchema = new Schema<LastCompletedSessionSnapshot>(
  {
    roundReached: { type: Number, required: true },
    finalStandings: { type: [sessionWinEntrySchema], required: true },
    endedWithWinner: { type: Boolean, required: true },
    endedAt: { type: Date, required: true },
  },
  { _id: false },
);

const groupSchema = new Schema<GroupDoc>({
  groupId: { type: String, required: true, unique: true },
  activeGame: { type: activeGameSchema, default: () => ({}) },
  lastCompletedSessionSnapshot: lastCompletedSessionSnapshotSchema,
});

export const Group = mongoose.model<GroupDoc>('Group', groupSchema);
