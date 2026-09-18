import type { DifficultyTier } from '../game/difficulty.js';

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
