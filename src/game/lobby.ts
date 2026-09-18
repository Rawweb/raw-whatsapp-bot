import crypto from 'node:crypto';
import { Group, SessionWinEntry } from '../models/Group.js';

export type OpenLobbyResult =
  | { ok: true; lobbyToken: string }
  | { ok: false; reason: 'already_active' };

// Creates (or resets) a group's game state and opens its lobby — either
// a standalone game, or round 1 of a brand-new session. Rejects if a
// game/session is already active in that group (lock rule). Rounds 2-5
// of an existing session go through openSessionRound() instead, since
// the group is deliberately still "active" between session rounds.
export async function openLobby(
  groupId: string,
  startedBy: string,
  isSession = false,
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
        isSession,
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
        letterSequence: [],
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

// Opens the lobby for session round `roundNumber` (2-5) — only valid
// while an existing session is locked, waiting between rounds, and the
// round just concluded was exactly the one before this one (sequential,
// no skipping). Doesn't touch currentRound yet — that only advances once
// the round actually starts playing (see round.ts's startRound), so a
// lobby that fails for too few players leaves the session retry-able.
export async function openSessionRound(
  groupId: string,
  roundNumber: number,
  startedBy: string,
): Promise<OpenLobbyResult> {
  const existing = await Group.findOne({ groupId });
  const game = existing?.activeGame;

  const canOpen =
    game?.isActive &&
    game.isSession &&
    game.phase === 'awaiting_next_round' &&
    game.currentRound === roundNumber - 1;

  if (!canOpen) {
    return { ok: false, reason: 'already_active' };
  }

  const lobbyToken = crypto.randomUUID();

  await Group.updateOne(
    { groupId },
    {
      $set: {
        'activeGame.phase': 'lobby',
        'activeGame.lobbyToken': lobbyToken,
        'activeGame.startedBy': startedBy,
        'activeGame.playerQueue': [],
      },
    },
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
// Standalone games only — a session must be ended with endSession()
// instead, per your spec's separate .raw end / .raw session end commands.
export async function endGame(
  groupId: string,
  requesterNumber: string,
): Promise<EndGameResult> {
  const group = await Group.findOne({ groupId });

  if (!group || !group.activeGame.isActive || group.activeGame.isSession) {
    return 'not_active';
  }

  if (group.activeGame.startedBy !== requesterNumber) {
    return 'not_starter';
  }

  const result = await Group.updateOne(
    {
      groupId,
      'activeGame.isActive': true,
      'activeGame.isSession': false,
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

export type EndSessionResult =
  | { status: 'ended'; standings: SessionWinEntry[] }
  | { status: 'not_active' }
  | { status: 'not_starter' };

// Manually terminates an active session — mirrors endGame(), but only
// for sessions, and returns the standings at the moment it ended so the
// caller can post them (per spec's "Current standings:" message).
export async function endSession(
  groupId: string,
  requesterNumber: string,
): Promise<EndSessionResult> {
  const group = await Group.findOne({ groupId });

  if (!group || !group.activeGame.isActive || !group.activeGame.isSession) {
    return { status: 'not_active' };
  }

  if (group.activeGame.startedBy !== requesterNumber) {
    return { status: 'not_starter' };
  }

  // Plain objects, not the Mongoose subdocuments group.activeGame gives
  // us directly — same reasoning as incrementSessionWin in turnEngine.ts
  const standings = group.activeGame.sessionWinCounts.map((e) => ({
    userId: e.userId,
    wins: e.wins,
  }));

  const result = await Group.updateOne(
    {
      groupId,
      'activeGame.isActive': true,
      'activeGame.isSession': true,
      'activeGame.startedBy': requesterNumber,
    },
    {
      $set: {
        'activeGame.isActive': false,
        'activeGame.phase': 'lobby',
        'activeGame.playerQueue': [],
      },
      // A manual .raw session end still counts as "the last completed
      // session" for .raw leaderboard purposes — without this, the
      // session simply vanishes from leaderboard the moment it's ended
      // this way (real bug, caught live: leaderboard said "no session
      // has been played" right after a session was just ended)
      lastCompletedSessionSnapshot: {
        roundReached: group.activeGame.currentRound,
        finalStandings: standings,
        endedWithWinner: false,
        endedAt: new Date(),
      },
    },
  );

  if (result.modifiedCount === 0) return { status: 'not_active' };

  return { status: 'ended', standings };
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
    // A round has actually started only once roundStartedAt moves off
    // its sentinel (see beginRound in turnEngine.ts) — if it's still
    // there, no round in this session has ever begun, meaning this was
    // round 1's own lobby failing. There's no ".raw first start" to
    // retry it with, so that case must fully unlock (like standalone)
    // rather than lock into 'awaiting_next_round' with nothing able to
    // reopen it. Rounds 2-5 failing keeps the lock — retried via the
    // same ordinal command (e.g. .raw third start again).
    const noRoundEverStarted = group.activeGame.roundStartedAt.getTime() === 0;

    if (group.activeGame.isSession && !noRoundEverStarted) {
      group.activeGame.phase = 'awaiting_next_round';
    } else {
      group.activeGame.isActive = false;
      group.activeGame.phase = 'lobby';
    }
    group.activeGame.playerQueue = [];
    await group.save();
    return { status: 'not_enough_players' };
  }

  group.activeGame.phase = 'in_progress';
  await group.save();
  return { status: 'closed', players };
}

export interface LeaderboardData {
  roundNumber: number;
  standings: SessionWinEntry[];
}

// .raw leaderboard's data source, per spec: the CURRENT session's live
// standings if one is running right now, otherwise the last one that
// actually completed — never the session before that, and never a
// standalone game (those don't have "standings", just a single winner).
export async function getLeaderboardData(
  groupId: string,
): Promise<LeaderboardData | null> {
  const group = await Group.findOne({ groupId });
  if (!group) return null;

  if (group.activeGame.isActive && group.activeGame.isSession) {
    return {
      roundNumber: group.activeGame.currentRound,
      standings: group.activeGame.sessionWinCounts,
    };
  }

  const snapshot = group.lastCompletedSessionSnapshot;
  if (snapshot) {
    return {
      roundNumber: snapshot.roundReached,
      standings: snapshot.finalStandings,
    };
  }

  return null;
}
