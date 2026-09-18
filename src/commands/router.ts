import { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { logger } from '../utils/logger.js';
import { resolveSenderNumber } from '../utils/resolveSender.js';
import { ADMIN_NUMBERS } from '../config/admins.js';

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

    // Exact, case-sensitive prefix match only
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

    // First real command handler: just proves the bot can reply at all.
    // No lobby/timer/join-tracking yet — that's a separate, bigger piece.
    if (command === 'start') {
      if (!isAdmin) continue; // non-admins: silently ignored, per decision

      await socket.sendMessage(remoteJid, {
        text: '🎮 Game starting...\n👥 Need 2 or more players\n⏳ You have 60 seconds to join ⏳',
      });
    }
  }
}
