import type { DifficultyTier } from '../game/difficulty.js';
import type { WordRejectionReason } from '../game/wordValidation.js';

// All bot-facing WhatsApp text lives in this one file — edit freely.
// This is the only place you need to change to reword what the bot says.

export const LOBBY_OPEN_STANDALONE =
  '🎮 Game starting...\n' +
  '👥 Need 2 or more players\n' +
  '💬 Type "Join" to enter\n' +
  '⏳ You have 60 seconds to join ⏳';

export const GAME_ALREADY_ACTIVE =
  '❌ A game is already in progress. End it first with .raw end, or wait for it to finish.';

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
