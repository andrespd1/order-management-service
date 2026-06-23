import Fastify, { type FastifyInstance } from "fastify";

// Builds the app without starting it, so tests can drive it via app.inject().
export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  // Liveness probe — no DB check (that would be a separate readiness probe).
  app.get("/health", async () => {
    return { status: "ok" };
  });

  return app;
}
