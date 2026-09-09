import Fastify from 'fastify';
import { createService, errorResult, type Authenticator, type Repository } from './gabi/service.js';

export function createApp(auth: Authenticator, repo: Repository) {
  const app = Fastify({ logger: false, bodyLimit: 16 * 1024, requestTimeout: 10_000 });
  const execute = createService(auth, repo);
  app.addHook('onSend', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });
  app.post('/v1/commands', async (request, reply) => {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.authorization ?? '');
    const result = await execute(match?.[1], request.body);
    return reply.code(result.status).send(result.body);
  });
  app.setErrorHandler((_error, _request, reply) => {
    const result = errorResult('invalid_request');
    return reply.code(result.status).send(result.body);
  });
  app.setNotFoundHandler((_request, reply) => {
    const result = errorResult('not_found_or_forbidden');
    return reply.code(result.status).send(result.body);
  });
  return app;
}
