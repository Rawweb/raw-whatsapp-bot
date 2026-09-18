import { loadEnvFile } from 'node:process';

if (process.env.NODE_ENV !== 'production') {
  loadEnvFile();
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  mongoUri: requireEnv('MONGO_URI'),
};
