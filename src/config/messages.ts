import type { DifficultyTier } from '../game/difficulty.js';
import type { WordRejectionReason } from '../game/wordValidation.js';
import type { SessionWinEntry } from '../models/Group.js';

// All bot-facing WhatsApp text lives in this one file — edit freely.
// This is the only place you need to change to reword what the bot says.

export const LOBBY_OPEN_STANDALONE =
  '🎮 Game starting...\n' +
  '👥 Need 2 or more players\n' +
  '💬 Type "Join" to enter\n' +
  '⏳ You have 60 seconds to join ⏳';

export const GAME_ALREADY_ACTIVE =
  '❌ A game is already in progress. End it first with .raw end, or wait for it to finish.';

export const SESSION_ALREADY_ACTIVE =
  '❌ A session is already active. End it first with .raw session end, or wait for it to complete.';

export function sessionLobbyOpen(roundNumber: number): string {
  return (
    `🎮 Session started — Round ${roundNumber} of 5\n` +
    `👥 Need 2 or more players\n` +
    `💬 Type "Join" to enter\n` +
    `⏳ You have 60 seconds to join ⏳`
  );
}

export function playerJoined(phoneNumber: string): string {
  return `✅ @${phoneNumber} joined`;
}

export const GAME_ENDED_BY_ADMIN = '🏁 Game ended by admin.';

// Sent partway through the join window, counting down time left to join
export function joinReminder(secondsLeft: number): string {
  return `⏳ ${secondsLeft} seconds left to join`;
}

export const LOBBY_TIME_ELAPSED = '⏰ Time elapsed. Locking in players.';

export const NOT_ENOUGH_PLAYERS =
  '❌ Not enough players joined. Need at least 2 players, game cancelled.';

export const NOT_GAME_STARTER =
  '❌ Only the admin who started this game can end it.';

export const NOT_SESSION_STARTER =
  '❌ Only the admin who started this session can end it.';

export const ROUND_CAP_EXCEEDED =
  '❌ This session is capped at 5 rounds. Session has ended.';

const TIER_EMOJI: Record<DifficultyTier, string> = {
  Easy: '🟢',
  Medium: '🟡',
  Hard: '🔴',
};

export function turnStatus(params: {
  currentPlayer: string;
  nextPlayer: string;
  letter: string;
  minLength: number;
  tier: DifficultyTier;
  playersRemaining: number;
  totalPlayers: number;
  timeLimitSeconds: number;
  totalWords: number;
}): string {
  return (
    `🎲 Turn: @${params.currentPlayer}\n` +
    `🔜 Next: @${params.nextPlayer}\n` +
    `🔤 Starts with ${params.letter.toUpperCase()} (at least ${params.minLength} letters)\n` +
    `${TIER_EMOJI[params.tier]} ${params.tier}\n` +
    `👥 Players left: ${params.playersRemaining}/${params.totalPlayers}\n` +
    `⏳ You have ${params.timeLimitSeconds} seconds to reply\n` +
    `📝 Total words: ${params.totalWords}`
  );
}

export function wordRejected(
  reason: WordRejectionReason,
  word: string,
  letter: string,
  minLength: number,
  phoneNumber: string,
): string {
  if (reason === 'duplicate') {
    return `❌ "${word}" has already been used this round. Try again, @${phoneNumber}.`;
  }
  if (reason === 'rule') {
    return (
      `❌ "${word}" doesn't meet the rule. Needs to start with ${letter.toUpperCase()} ` +
      `and be at least ${minLength} letters. Try again , @${phoneNumber}.`
    );
  }
  return `❌ "${word}" isn't in my word list. Try again, @${phoneNumber}.`;
}

export function timeoutElimination(phoneNumber: string): string {
  return `⏱️ Time's up, @${phoneNumber}! You're out 😥.`;
}

export function roundWinStandalone(params: {
  winner: string;
  totalWords: number;
  longestWord: string;
  longestWordLength: number;
  longestWordBy: string;
  elapsed: string;
}): string {
  // No word was ever accepted this round (e.g. an immediate timeout) —
  // there's nothing meaningful to report for "longest word"
  const longestWordLine = params.longestWordBy
    ? `Longest word: ${params.longestWord} (${params.longestWordLength}) by @${params.longestWordBy}\n`
    : '';

  return (
    `🏆 @${params.winner} won the game!\n` +
    `Words: ${params.totalWords}\n` +
    longestWordLine +
    `Time: ${params.elapsed}`
  );
}

export function roundWinSession(params: {
  roundNumber: number;
  winner: string;
  totalWords: number;
  longestWord: string;
  longestWordLength: number;
  longestWordBy: string;
  elapsed: string;
  winnerSessionWins: number;
}): string {
  const longestWordLine = params.longestWordBy
    ? `Longest word: ${params.longestWord} (${params.longestWordLength}) by @${params.longestWordBy}\n`
    : '';

  return (
    `🏆 @${params.winner} won Round ${params.roundNumber}!\n` +
    `Words: ${params.totalWords}\n` +
    longestWordLine +
    `Time: ${params.elapsed}\n\n` +
    `🏅 Session score: @${params.winner} has ${params.winnerSessionWins} win(s)`
  );
}

export function sessionCompleteWinner(winner: string): string {
  return `🎉 Session complete! @${winner} reached 3 wins and takes the session.`;
}

export const SESSION_COMPLETE_NO_WINNER =
  '🏁 Session complete. No player reached 3 wins. No prize awarded this session.';

function formatStandings(standings: SessionWinEntry[]): string {
  return [...standings]
    .sort((a, b) => b.wins - a.wins)
    .map((entry) => `@${entry.userId} — ${entry.wins} win(s)`)
    .join('\n');
}

export function sessionEndedByAdmin(standings: SessionWinEntry[]): string {
  return `🏁 Session ended by admin. Current standings:\n${formatStandings(standings)}`;
}

export function sessionLeaderboard(
  roundNumber: number,
  standings: SessionWinEntry[],
): string {
  return (
    `📊 Session leaderboard (Round ${roundNumber} of 5)\n` +
    formatStandings(standings)
  );
}

export const NO_SESSION_PLAYED =
  'No session has been played in this group yet.';

export function totalboard(
  entries: { userId: string; totalWins: number; longestWord: string; longestWordLength: number }[],
): string {
  const lines = [...entries]
    .sort((a, b) => b.totalWins - a.totalWins)
    .map((entry) => {
      const wordPart = entry.longestWord
        ? ` | longest word: ${entry.longestWord} (${entry.longestWordLength})`
        : '';
      return `@${entry.userId} — ${entry.totalWins} win(s)${wordPart}`;
    })
    .join('\n');

  return `🏆 All-time leaderboard\n${lines}`;
}

export const NO_STATS_YET = 'No games have been played in this group yet.';
