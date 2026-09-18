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
