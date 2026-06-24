import type { FastifyInstance } from "fastify";
import type { OrderController } from "../controllers/order-controller.js";

const UUID = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

const bodySchema = {
  type: "object",
  required: ["customerId", "shippingAddress", "items", "payment"],
  additionalProperties: false,
  properties: {
    customerId: { type: "string", pattern: UUID },
    shippingAddress: {
      type: "object",
      required: ["line1", "city", "country", "latitude", "longitude"],
      additionalProperties: false,
      properties: {
        line1: { type: "string", minLength: 1 },
        city: { type: "string", minLength: 1 },
        region: { type: "string" },
        postalCode: { type: "string" },
        country: { type: "string", minLength: 2 },
        latitude: { type: "number", minimum: -90, maximum: 90 },
        longitude: { type: "number", minimum: -180, maximum: 180 },
      },
    },
    items: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["productId", "quantity"],
        additionalProperties: false,
        properties: {
          productId: { type: "string", pattern: UUID },
          quantity: { type: "integer", minimum: 1 },
        },
      },
    },
    payment: {
      type: "object",
      required: ["cardNumber"],
      additionalProperties: false,
      properties: {
        cardNumber: { type: "string", pattern: "^[0-9]{12,19}$" },
      },
    },
  },
} as const;

export function registerOrderRoutes(app: FastifyInstance, controller: OrderController): void {
  app.post(
    "/orders",
    { schema: { summary: "Create an order", tags: ["orders"], body: bodySchema } },
    (request, reply) => controller.create(request, reply),
  );
}
