import makeWASocket, {
  DisconnectReason,
  WASocket,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { useMongoDBAuthState } from './authState.js';
import { logger } from '../utils/logger.js';

export async function connectToWhatsApp(): Promise<WASocket> {
  // Load creds/keys from MongoDB (or blank ones, on first-ever run)
  const { state, saveCreds } = await useMongoDBAuthState();

  // Open the actual WhatsApp socket connection
  const socket = makeWASocket({
    auth: state,
    logger,
  });

  // Persist creds to MongoDB every time Baileys updates them
  socket.ev.on('creds.update', saveCreds);

  // React to connection lifecycle changes: QR ready, closed, opened
  socket.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    // A new QR code is ready to scan — print it to the terminal
    if (qr) {
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      // Baileys' close errors carry an HTTP-style status code here
      const statusCode = (
        lastDisconnect?.error as { output?: { statusCode?: number } }
      )?.output?.statusCode;

      // Reconnect unless we were actually logged out (fresh QR needed then)
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.error({ statusCode }, 'WhatsApp connection closed');

      if (shouldReconnect) {
        connectToWhatsApp();
      } else {
        logger.error(
          'Logged out of WhatsApp. Clear stored auth state and scan a new QR to reconnect.',
        );
      }
    } else if (connection === 'open') {
      logger.info('WhatsApp connection established');
    }
  });

  return socket;
}
