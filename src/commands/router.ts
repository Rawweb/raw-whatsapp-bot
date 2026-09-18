import { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { logger } from '../utils/logger.js';
import { resolveSenderNumber } from '../utils/resolveSender.js';
import { ADMIN_NUMBERS } from '../config/admins.js';
import { openLobby, addPlayerToLobby } from '../game/lobby.js';
import {
  LOBBY_OPEN_STANDALONE,
  GAME_ALREADY_ACTIVE,
  playerJoined,
} from '../config/messages.js';

const COMMAND_PREFIX = '.raw';

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

    // Exact, case-sensitive prefix match only, for everything else
    if (!trimmed.startsWith(COMMAND_PREFIX)) continue;

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
      if (!isAdmin) continue; // non-admins: silently ignored, per decision

      const result = await openLobby(remoteJid);

      if (!result.ok) {
        await socket.sendMessage(remoteJid, { text: GAME_ALREADY_ACTIVE });
        continue;
      }

      await socket.sendMessage(remoteJid, { text: LOBBY_OPEN_STANDALONE });
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
