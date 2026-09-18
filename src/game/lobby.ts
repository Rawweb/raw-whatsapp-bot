import { Group } from '../models/Group.js';

export type OpenLobbyResult = { ok: true } | { ok: false; reason: 'already_active' };

// Creates (or resets) a group's game state and opens its lobby.
// Rejects if a game/session is already active in that group (lock rule).
export async function openLobby(groupId: string): Promise<OpenLobbyResult> {
  const existing = await Group.findOne({ groupId });

  if (existing?.activeGame.isActive) {
    return { ok: false, reason: 'already_active' };
  }

  await Group.findOneAndUpdate(
    { groupId },
    {
      groupId,
      activeGame: {
        isSession: false,
        currentRound: 1,
        isActive: true,
        phase: 'lobby',
        playerQueue: [],
        currentTurnIndex: 0,
        eliminated: [],
        wordsUsedThisRound: [],
        totalWordsThisRound: 0,
        difficultyLevel: 0,
        sessionWinCounts: [],
      },
    },
    { upsert: true },
  );

  return { ok: true };
}

export type JoinResult = 'joined' | 'already_joined' | 'not_open';

// Adds a player to the open lobby. Uses an atomic $addToSet update rather
// than read-modify-save, so two people joining at nearly the same instant
// can't race each other and silently lose one of the joins.
export async function addPlayerToLobby(
  groupId: string,
  userId: string,
): Promise<JoinResult> {
  const group = await Group.findOne({ groupId });

  if (!group || group.activeGame.phase !== 'lobby') {
    return 'not_open';
  }

  const result = await Group.updateOne(
    { groupId, 'activeGame.phase': 'lobby' },
    { $addToSet: { 'activeGame.playerQueue': userId } },
  );

  return result.modifiedCount > 0 ? 'joined' : 'already_joined';
}
