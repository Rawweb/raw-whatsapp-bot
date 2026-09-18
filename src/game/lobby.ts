import crypto from 'node:crypto';
import { Group } from '../models/Group.js';

export type OpenLobbyResult =
  | { ok: true; lobbyToken: string }
  | { ok: false; reason: 'already_active' };

// Creates (or resets) a group's game state and opens its lobby.
// Rejects if a game/session is already active in that group (lock rule).
export async function openLobby(
  groupId: string,
  startedBy: string,
): Promise<OpenLobbyResult> {
  const existing = await Group.findOne({ groupId });

  if (existing?.activeGame.isActive) {
    return { ok: false, reason: 'already_active' };
  }

  // Fresh token per lobby — see the comment on Group.ts's lobbyToken field
  const lobbyToken = crypto.randomUUID();

  await Group.findOneAndUpdate(
    { groupId },
    {
      groupId,
      activeGame: {
        isSession: false,
        currentRound: 1,
        isActive: true,
        phase: 'lobby',
        lobbyToken,
        startedBy,
        playerQueue: [],
        currentTurnIndex: 0,
        eliminated: [],
        wordsUsedThisRound: [],
        totalWordsThisRound: 0,
        turnNumber: 0,
        currentLetter: '',
        turnToken: '',
        turnResolved: true,
        roundStartedAt: new Date(0),
        longestWord: { word: '', length: 0, userId: '' },
        sessionWinCounts: [],
      },
    },
    { upsert: true },
  );

  return { ok: true, lobbyToken };
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

export type EndGameResult = 'ended' | 'not_active' | 'not_starter';

// Manually terminates whatever game/lobby is active in a group — but
// only for the admin who started it (checked before the write, then
// again inside the update's filter so a race can't slip past the check).
export async function endGame(
  groupId: string,
  requesterNumber: string,
): Promise<EndGameResult> {
  const group = await Group.findOne({ groupId });

  if (!group || !group.activeGame.isActive) {
    return 'not_active';
  }

  if (group.activeGame.startedBy !== requesterNumber) {
    return 'not_starter';
  }

  const result = await Group.updateOne(
    {
      groupId,
      'activeGame.isActive': true,
      'activeGame.startedBy': requesterNumber,
    },
    {
      $set: {
        'activeGame.isActive': false,
        'activeGame.phase': 'lobby',
        'activeGame.playerQueue': [],
      },
    },
  );

  return result.modifiedCount > 0 ? 'ended' : 'not_active';
}

// Checks whether a lobby the caller opened earlier (identified by its
// token) is still the live, open one — false if it was ended/replaced
// since, or already closed.
export async function isLobbyStillOpen(
  groupId: string,
  lobbyToken: string,
): Promise<boolean> {
  const group = await Group.findOne({ groupId });

  return (
    !!group &&
    group.activeGame.isActive &&
    group.activeGame.lobbyToken === lobbyToken &&
    group.activeGame.phase === 'lobby'
  );
}

export type CloseLobbyResult =
  | { status: 'stale' }
  | { status: 'not_enough_players' }
  | { status: 'closed'; players: string[] };

// Closes the join window: cancels the game if fewer than 2 players
// joined, otherwise transitions into 'in_progress'. `stale` means this
// lobby was already ended/replaced before its timer got here.
export async function closeLobby(
  groupId: string,
  lobbyToken: string,
): Promise<CloseLobbyResult> {
  const group = await Group.findOne({ groupId });

  if (
    !group ||
    !group.activeGame.isActive ||
    group.activeGame.lobbyToken !== lobbyToken
  ) {
    return { status: 'stale' };
  }

  const players = group.activeGame.playerQueue;

  if (players.length < 2) {
    group.activeGame.isActive = false;
    group.activeGame.phase = 'lobby';
    group.activeGame.playerQueue = [];
    await group.save();
    return { status: 'not_enough_players' };
  }

  group.activeGame.phase = 'in_progress';
  await group.save();
  return { status: 'closed', players };
}
