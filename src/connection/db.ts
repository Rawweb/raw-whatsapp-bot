import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

dns.setServers(['8.8.8.8', '1.1.1.1']);

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(env.mongoUri);
    logger.info('Connected to MongoDB');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to MongoDB');
    process.exit(1);
  }
}
