import Fastify, { type FastifyInstance } from "fastify";

/**
 * Builds and configures the Fastify application without starting it.
 * Returning the instance (rather than calling listen() here) keeps the app
 * testable via app.inject(), and lets the entrypoint own process lifecycle.
 */
export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  // Liveness probe. Intentionally cheap: no DB or downstream checks here so it
  // stays a pure "is the process up" signal. A readiness check (DB reachable,
  // etc.) would be a separate endpoint added when those dependencies exist.
  app.get("/health", async () => {
    return { status: "ok" };
  });

  return app;
}
