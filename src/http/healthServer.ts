import http from 'node:http';
import { logger } from '../utils/logger.js';

// Render assigns this dynamically and requires a "Web Service" to bind
// to it — that's what makes Render consider the service "up" at all.
// Locally there's no PORT env var, so this just falls back to 3000.
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// The whole point of this server: something for an external cron job
// to hit every 10-12 minutes so Render doesn't spin the free-tier
// service down after 15 minutes of no HTTP traffic (see your spec's
// deployment section). No real logic needed — any 200 response counts.
export function startHealthServer(): void {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  });

  // Without this, a port already in use (or any other bind failure)
  // becomes an unhandled 'error' event, which crashes the ENTIRE
  // process — not just the health server. Caught live: port 3000 was
  // already taken by another local project, and startHealthServer()
  // took the whole bot down with it before this fix.
  server.on('error', (error) => {
    logger.error({ error, port: PORT }, 'Health-check server failed to start');
  });

  server.listen(PORT, () => {
    logger.info({ port: PORT }, 'Health-check server listening');
  });
}
