import makeWASocket, {
  DisconnectReason,
  WASocket,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { useMongoDBAuthState } from './authState.js';
import { handleIncomingMessages } from '../commands/router.js';
import { logger } from '../utils/logger.js';

const RECONNECT_RETRY_DELAY_MS = 10_000;

// The one always-current socket. Anything that fires immediately (a
// message handler, called synchronously by Baileys with whatever socket
// is live right now) can safely use the socket it was handed directly.
// But anything scheduled to run LATER — a turn timeout, a lobby
// reminder — must not hold onto that same reference across the delay,
// since a reconnect in between replaces the socket entirely and the
// old one silently stops working (sendMessage on it never
// resolves — no error, just a permanent hang). Those call
// getCurrentSocket() at the moment they actually send, instead.
let currentSocket: WASocket | undefined;

export function getCurrentSocket(): WASocket {
  if (!currentSocket) {
    throw new Error('getCurrentSocket() called before any connection was established');
  }
  return currentSocket;
}

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

  currentSocket = socket;

  // On a headless deployment (e.g. Render), scanning a QR rendered
  // inside a web-based log viewer is unreliable — the ASCII art
  // doesn't survive browser rendering cleanly enough for a phone
  // camera to actually read it (confirmed live: renders fine, still
  // unscannable). Setting PAIRING_PHONE_NUMBER switches to WhatsApp's
  // pairing-code method instead: a short code you type directly into
  // the phone, no camera involved. Requested once, before the account
  // is actually registered — Baileys' own recommended pattern. Left
  // unset, QR scanning is used as before (fine for local dev, where a
  // real terminal renders it perfectly).
  const pairingPhoneNumber = process.env.PAIRING_PHONE_NUMBER;
  if (pairingPhoneNumber && !state.creds.registered) {
    const code = await socket.requestPairingCode(pairingPhoneNumber);
    logger.info(
      { code },
      'Enter this code in WhatsApp: Linked Devices > Link a Device > Link with phone number instead',
    );
  }

  // Persist creds to MongoDB every time Baileys updates them
  socket.ev.on('creds.update', saveCreds);

  // React to connection lifecycle changes: QR ready, closed, opened
  socket.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    // A new QR code is ready to scan — print it to the terminal.
    // Skipped when pairing by phone number instead (see above).
    if (qr && !pairingPhoneNumber) {
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
