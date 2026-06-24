import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import type { OrderController } from "./controllers/order-controller.js";
import { registerOrderRoutes } from "./routes/orders.js";
import { mapError } from "./error-mapper.js";

// The controllers the server wires to routes; built by the composition root.
export interface Controllers {
  orders: OrderController;
}

// Builds the app without starting it. Controllers are injected, so tests can pass ones
// wired with in-memory adapters and drive real HTTP via app.inject().
export async function buildServer(controllers: Controllers): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  // Register OpenAPI before the routes so it collects their schemas; UI served at /docs.
  await app.register(fastifySwagger, {
    openapi: { info: { title: "Order Management Service", version: "0.1.0" } },
  });
  await app.register(fastifySwaggerUi, { routePrefix: "/docs" });

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
