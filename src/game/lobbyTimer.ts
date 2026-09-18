import type { WASocket } from '@whiskeysockets/baileys';
import { closeLobby, isLobbyStillOpen } from './lobby.js';
import {
  joinReminder,
  LOBBY_TIME_ELAPSED,
  NOT_ENOUGH_PLAYERS,
} from '../config/messages.js';
import { logger } from '../utils/logger.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Total join window, and when (in ms elapsed since the window opened)
// each "time left" reminder fires. Edit these two lines to retune the
// timing — nothing else in this file needs to change.
const WINDOW_MS = 60_000;
const REMINDERS = [
  { atMs: 15_000, secondsLeft: 45 },
  { atMs: 30_000, secondsLeft: 30 },
  { atMs: 45_000, secondsLeft: 15 },
];

// Runs the whole life of one lobby's join window: each reminder above,
// then closing it (cancel or hand off to gameplay) once WINDOW_MS has
// elapsed. Every step re-checks the lobby is still the same one that
// was opened — see lobbyToken's comment in Group.ts — so a game that
// was manually ended (and maybe restarted) mid-window can't have a
// stale timer interfere with it.
export async function runLobbyTimer(
  socket: WASocket,
  groupId: string,
  lobbyToken: string,
): Promise<void> {
  let elapsed = 0;

  for (const reminder of REMINDERS) {
    await sleep(reminder.atMs - elapsed);
    elapsed = reminder.atMs;

    if (!(await isLobbyStillOpen(groupId, lobbyToken))) return;
    await socket.sendMessage(groupId, {
      text: joinReminder(reminder.secondsLeft),
    });
  }

  await sleep(WINDOW_MS - elapsed);
  const result = await closeLobby(groupId, lobbyToken);

  if (result.status === 'stale') return;

  if (result.status === 'not_enough_players') {
    await socket.sendMessage(groupId, { text: NOT_ENOUGH_PLAYERS });
    return;
  }

  await socket.sendMessage(groupId, { text: LOBBY_TIME_ELAPSED });

  // Turn engine doesn't exist yet — this is as far as the game gets for now
  logger.info(
    { groupId, players: result.players },
    'Lobby closed with enough players — turn engine not built yet',
  );
}
