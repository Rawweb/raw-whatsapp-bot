import makeWASocket, {
  DisconnectReason,
  WASocket,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { useMongoDBAuthState } from './authState.js';
import { handleIncomingMessages } from '../commands/router.js';
import { logger } from '../utils/logger.js';

const RECONNECT_RETRY_DELAY_MS = 10_000;

// Keeps retrying connectToWhatsApp() until it actually succeeds, instead
// of giving up after one failed attempt. Needed because a reconnect can
// itself fail (e.g. MongoDB briefly unreachable during the same network
// blip that dropped WhatsApp) — without this, one bad-timing failure
// would leave the bot permanently disconnected until manually restarted.
async function reconnectWithRetry(): Promise<void> {
  try {
    await connectToWhatsApp();
  } catch (error) {
    logger.error(
      { error },
      `Reconnect failed, retrying in ${RECONNECT_RETRY_DELAY_MS / 1000}s`,
    );
    await new Promise((resolve) => setTimeout(resolve, RECONNECT_RETRY_DELAY_MS));
    await reconnectWithRetry();
  }
}

export async function connectToWhatsApp(): Promise<WASocket> {
  // Load creds/keys from MongoDB (or blank ones, on first-ever run)
  const { state, saveCreds } = await useMongoDBAuthState();

  // Open the actual WhatsApp socket connection
  const socket = makeWASocket({
    auth: state,
    logger,
    // Shows as the linked device name in WhatsApp's "Linked Devices" list
    browser: ['Rawfile Game Bot', 'Chrome', '1.0.0'],
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
        // Retries until it succeeds, rather than giving up after one
        // failed attempt — see reconnectWithRetry's comment above
        reconnectWithRetry();
      } else {
        logger.error(
          'Logged out of WhatsApp. Clear stored auth state and scan a new QR to reconnect.',
        );
      }
    } else if (connection === 'open') {
      logger.info('WhatsApp connection established');
    }
  });

  // Every incoming message passes through here for command parsing.
  // Caught so one failed message (e.g. a transient Mongo blip) logs an
  // error instead of an unhandled rejection crashing the whole process.
  socket.ev.on('messages.upsert', ({ messages }) => {
    handleIncomingMessages(socket, messages).catch((error) => {
      logger.error({ error }, 'Error handling incoming messages');
    });
  });

  return socket;
}
