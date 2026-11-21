import type { FastifyInstance } from 'fastify';
import { errorResult, type Authenticator } from './gabi/service.js';
import { bearerToken } from './mcp.js';
import { PILOT_ID } from './integrations/pilot.js';

export interface RefreshablePilot { refresh(): Promise<void>; }

// The refresh is deliberately separate from the read commands: it is an explicit
// local operator action, never an agent tool, browser action, or scheduled task.
export function registerPilotRefresh(app: FastifyInstance, auth: Authenticator, pilot: RefreshablePilot) {
  app.post('/pilot/refresh', async (request, reply) => {
    const principal = await auth.authenticate(bearerToken(request.headers.authorization));
    if (!principal || principal.siteId !== PILOT_ID) {
      const result = errorResult('unauthenticated');
      return reply.code(result.status).send(result.body);
    }
    try {
      await pilot.refresh();
      return reply.code(204).send();
    } catch {
      const result = errorResult('dependency_unavailable');
      return reply.code(result.status).send(result.body);
    }
  });
}
