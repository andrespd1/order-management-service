import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { OrderController } from "./controllers/order-controller.js";
import { registerOrderRoutes } from "./routes/orders.js";
import { mapError } from "./error-mapper.js";

// The controllers the server wires to routes; built by the composition root.
export interface Controllers {
  orders: OrderController;
}

// Builds the app without starting it. Controllers are injected, so tests can pass ones
// wired with in-memory adapters and drive real HTTP via app.inject().
export function buildServer(controllers: Controllers): FastifyInstance {
  const app = Fastify({ logger: true });

  // Liveness probe — no DB check (that would be a separate readiness probe).
  app.get("/health", async () => ({ status: "ok" }));

  registerOrderRoutes(app, controllers.orders);

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const { status, code, message } = mapError(error);
    if (status === 500) request.log.error(error);
    return reply.code(status).send({ error: { code, message } });
  });

  return app;
}
