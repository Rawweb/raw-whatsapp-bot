import { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { logger } from '../utils/logger.js';
import { resolveSenderNumber } from '../utils/resolveSender.js';
import { ADMIN_NUMBERS } from '../config/admins.js';
import {
  openLobby,
  openSessionRound,
  addPlayerToLobby,
  endGame,
  endSession,
} from '../game/lobby.js';
import { runLobbyTimer } from '../game/lobbyTimer.js';
import { handleWordSubmission } from '../game/turnEngine.js';
import {
  LOBBY_OPEN_STANDALONE,
  GAME_ALREADY_ACTIVE,
  SESSION_ALREADY_ACTIVE,
  sessionLobbyOpen,
  playerJoined,
  GAME_ENDED_BY_ADMIN,
  NOT_GAME_STARTER,
  NOT_SESSION_STARTER,
  ROUND_CAP_EXCEEDED,
  sessionEndedByAdmin,
} from '../config/messages.js';

const COMMAND_PREFIX = '.raw';

// Maps a .raw command's round word to its round number (round 1 is
// always .raw session start, never spelled "first")
const ROUND_ORDINALS: Record<string, number> = {
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
};
const BEYOND_CAP_ORDINALS = new Set([
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
]);

export async function handleIncomingMessages(
  socket: WASocket,
  messages: WAMessage[],
): Promise<void> {
  for (const msg of messages) {
    // Ignore messages the bot itself sent, to avoid reacting to its own output
    if (msg.key.fromMe) continue;

    // Groups only — remoteJid ends in "@g.us" for a group, "@s.whatsapp.net" for a DM
    const remoteJid = msg.key.remoteJid;
    if (!remoteJid?.endsWith('@g.us')) continue;

    // Plain text lives in `conversation`; text with reply/link-preview
    // context lives in `extendedTextMessage.text` instead
    const text =
      msg.message?.conversation ?? msg.message?.extendedTextMessage?.text;
    if (!text) continue;

    const trimmed = text.trim();

    // "Join" is matched case-insensitively and is a separate kind of
    // trigger from .raw commands — handled on its own, then move on
    if (trimmed.toLowerCase() === 'join') {
      await handleJoin(socket, remoteJid, msg);
      continue;
    }

    // Not a .raw command either — treat it as a possible word submission.
    // handleWordSubmission itself no-ops unless a round is actually in
    // progress and this sender is the current player.
    if (!trimmed.startsWith(COMMAND_PREFIX)) {
      const senderJid = msg.key.participant ?? msg.key.remoteJid;
      const senderNumber = senderJid
        ? await resolveSenderNumber(socket, remoteJid, senderJid)
        : null;
      if (senderNumber) {
        await handleWordSubmission(
          socket,
          remoteJid,
          senderNumber,
          trimmed,
          msg.key,
        );
      }
      continue;
    }

    // Everything after ".raw" is the actual command, e.g. "start", "session start"
    const command = trimmed.slice(COMMAND_PREFIX.length).trim();

    // In a group, the actual sender is `participant` — `remoteJid` is the group itself
    const senderJid = msg.key.participant ?? msg.key.remoteJid;
    const senderNumber = senderJid
      ? await resolveSenderNumber(socket, remoteJid, senderJid)
      : null;
    const isAdmin = senderNumber ? ADMIN_NUMBERS.includes(senderNumber) : false;

    logger.info(
      { groupId: remoteJid, command, senderNumber, isAdmin },
      'Received .raw command',
    );

    if (command === 'start') {
      if (!isAdmin || !senderNumber) continue; // non-admins: silently ignored

      const result = await openLobby(remoteJid, senderNumber);

      if (!result.ok) {
        await socket.sendMessage(remoteJid, { text: GAME_ALREADY_ACTIVE });
        continue;
      }

      await socket.sendMessage(remoteJid, { text: LOBBY_OPEN_STANDALONE });

      // Fire-and-forget: runs independently of any further incoming
      // messages, caught so a failure logs instead of crashing the process
      runLobbyTimer(socket, remoteJid, result.lobbyToken, 1).catch((error) => {
        logger.error({ error }, 'Error running lobby timer');
      });
    } else if (command === 'end') {
      if (!isAdmin || !senderNumber) continue; // non-admins: silently ignored

      const result = await endGame(remoteJid, senderNumber);

      if (result === 'ended') {
        await socket.sendMessage(remoteJid, { text: GAME_ENDED_BY_ADMIN });
      } else if (result === 'not_starter') {
        await socket.sendMessage(remoteJid, { text: NOT_GAME_STARTER });
      }
      // 'not_active': nothing was running — silently ignored
    } else if (command === 'session start') {
      if (!isAdmin || !senderNumber) continue;

      const result = await openLobby(remoteJid, senderNumber, true);

      if (!result.ok) {
        await socket.sendMessage(remoteJid, { text: SESSION_ALREADY_ACTIVE });
        continue;
      }

      await socket.sendMessage(remoteJid, { text: sessionLobbyOpen(1) });

      runLobbyTimer(socket, remoteJid, result.lobbyToken, 1).catch((error) => {
        logger.error({ error }, 'Error running lobby timer');
      });
    } else if (command === 'session end') {
      if (!isAdmin || !senderNumber) continue;

      const result = await endSession(remoteJid, senderNumber);

      if (result.status === 'ended') {
        await socket.sendMessage(remoteJid, {
          text: sessionEndedByAdmin(result.standings),
          mentions: result.standings.map((s) => `${s.userId}@s.whatsapp.net`),
        });
      } else if (result.status === 'not_starter') {
        await socket.sendMessage(remoteJid, { text: NOT_SESSION_STARTER });
      }
      // 'not_active': nothing was running — silently ignored
    } else if (BEYOND_CAP_ORDINALS.has(command.replace(/\s*start$/, ''))) {
      if (!isAdmin || !senderNumber) continue;
      await socket.sendMessage(remoteJid, { text: ROUND_CAP_EXCEEDED });
    } else {
      const ordinal = command.replace(/\s*start$/, '');
      const roundNumber = ROUND_ORDINALS[ordinal];

      if (roundNumber && command === `${ordinal} start`) {
        if (!isAdmin || !senderNumber) continue;

        const result = await openSessionRound(remoteJid, roundNumber, senderNumber);
        // Unlike .raw start/.raw session start, a rejection here has no
        // single clear cause (no session running at all, wrong round
        // order, mid-round already, etc.) — silently ignored rather
        // than risk a misleading message
        if (!result.ok) continue;

        await socket.sendMessage(remoteJid, {
          text: sessionLobbyOpen(roundNumber),
        });

        runLobbyTimer(socket, remoteJid, result.lobbyToken, roundNumber).catch(
          (error) => {
            logger.error({ error }, 'Error running lobby timer');
          },
        );
      }
    }
  }
}

async function handleJoin(
  socket: WASocket,
  groupJid: string,
  msg: WAMessage,
): Promise<void> {
  const senderJid = msg.key.participant ?? msg.key.remoteJid;
  if (!senderJid) return;

  const senderNumber = await resolveSenderNumber(socket, groupJid, senderJid);
  if (!senderNumber) return;

  const result = await addPlayerToLobby(groupJid, senderNumber);

  // Repeat joins, and joins after the window closes, are both silent per spec
  if (result !== 'joined') return;

  await socket.sendMessage(groupJid, {
    text: playerJoined(senderNumber),
    mentions: [`${senderNumber}@s.whatsapp.net`],
  });
}
