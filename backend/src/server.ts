import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { jobsRoutes } from './http/jobs.routes.js';
import { questionsRoutes } from './http/questions.routes.js';
import { candidatesRoutes } from './http/candidates.routes.js';
import { interviewsRoutes } from './http/interviews.routes.js';
import { twimlRoutes } from './http/twiml.routes.js';
import { mediaWsRoute } from './voice/ws.js';
import { startDialer } from './scheduler/dialer.js';

async function main() {
  const app = Fastify({ loggerInstance: logger });

  await app.register(cors, { origin: true });
  await app.register(formbody);
  await app.register(websocket);

  app.get('/health', async () => ({ ok: true }));

  await app.register(jobsRoutes);
  await app.register(questionsRoutes);
  await app.register(candidatesRoutes);
  await app.register(interviewsRoutes);
  await app.register(twimlRoutes);
  await app.register(mediaWsRoute);

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info(`listening on ${config.PORT}`);

  startDialer();
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
