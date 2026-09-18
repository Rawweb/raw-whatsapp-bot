import { connectDatabase } from './connection/db.js';
import { connectToWhatsApp } from './connection/whatsapp.js';
import { startHealthServer } from './http/healthServer.js';
import { logger } from './utils/logger.js';

// Last-resort safety net, for errors our own .catch() wrappers can
// never reach — specifically anything thrown deep inside a third-party
// library's own internals (e.g. Baileys' own reconnect/query logic),
// which we don't call directly and so have nothing to wrap. Node kills
// the whole process on any unhandled rejection by default; this is what
// stops that. Doesn't touch connectDatabase()'s intentional
// process.exit(1) on startup failure — that's a local try/catch calling
// exit directly, so it never becomes "unhandled" in the first place.
//
// A rejected promise (unhandledRejection) doesn't corrupt anything
// mid-execution, so just logging and continuing is safe. A genuinely
// uncaught synchronous exception (uncaughtException) is riskier to
// keep running after — Node's own guidance is to exit and let the
// platform (Render restarting the service, or PM2 in production)
// bring up a fresh process instead of limping on in an unknown state.
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception — exiting for a clean restart');
  process.exit(1);
});

async function main(): Promise<void> {
  // Fail fast if MongoDB isn't reachable before touching WhatsApp at all
  await connectDatabase();

  // Started BEFORE the WhatsApp connection, not after — Render needs to
  // see an open port to consider the deploy live, and WhatsApp
  // connecting (or pairing) can be slow or flaky on its own. Gating
  // this behind a successful WhatsApp connection meant any hiccup there
  // left Render's port scan finding nothing, forever — caught live:
  // the deploy sat stuck on "No open ports detected" while a WhatsApp
  // reconnect was still in progress.
  startHealthServer();

  // Open the WhatsApp connection — prints a QR (or requests a pairing
  // code — see whatsapp.ts) on first run
  await connectToWhatsApp();

  logger.info('Bot boot sequence complete');
}

main();
