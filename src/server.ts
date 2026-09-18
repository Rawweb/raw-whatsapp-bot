import { connectDatabase } from './connection/db.js';
import { connectToWhatsApp } from './connection/whatsapp.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  // Fail fast if MongoDB isn't reachable before touching WhatsApp at all
  await connectDatabase();

  // Open the WhatsApp connection — prints a QR to scan on first run
  await connectToWhatsApp();

  logger.info('Bot boot sequence complete');
}

main();
