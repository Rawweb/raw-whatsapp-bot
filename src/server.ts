import { connectDatabase } from './connection/db.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  await connectDatabase();
  logger.info('Bot boot sequence starting...');
}

main();
