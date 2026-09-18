import type { WASocket } from '@whiskeysockets/baileys';

// Turns whatever identifier WhatsApp gave us for a group sender into
// their actual phone number, resolving through group metadata if needed.
export async function resolveSenderNumber(
  socket: WASocket,
  groupJid: string,
  participantJid: string,
): Promise<string | null> {
  // Already a phone-number JID — extract the digits directly, no lookup needed
  if (participantJid.endsWith('@s.whatsapp.net')) {
    return participantJid.split('@')[0];
  }

  // A privacy "@lid" identifier — resolve it via the group's member list
  if (participantJid.endsWith('@lid')) {
    const metadata = await socket.groupMetadata(groupJid);
    const participant = metadata.participants.find(
      (p) => p.lid === participantJid,
    );
    const phoneJid = participant?.jid ?? participant?.id;

    if (phoneJid?.endsWith('@s.whatsapp.net')) {
      return phoneJid.split('@')[0];
    }
  }

  return null;
}
