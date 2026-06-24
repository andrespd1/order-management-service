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

const orderResponse = {
  type: "object",
  properties: {
    id: { type: "string" },
    status: { type: "string", enum: ["PENDING", "PAID", "PAYMENT_FAILED", "CANCELLED"] },
    customerId: { type: "string" },
    warehouseId: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          productId: { type: "string" },
          quantity: { type: "integer" },
          unitPrice: { type: "integer" },
        },
      },
    },
    totalAmount: { type: "integer" },
    currency: { type: "string" },
    paymentTransactionId: { type: ["string", "null"] },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const errorResponse = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
    },
  },
} as const;

export function registerOrderRoutes(app: FastifyInstance, controller: OrderController): void {
  app.post(
    "/orders",
    {
      schema: {
        summary: "Create an order",
        description:
          "Reserves stock at the nearest warehouse that can fill the whole order, charges the " +
          "(mocked) payment, and persists the order. Supply an Idempotency-Key header to make the " +
          "call safe to retry.",
        tags: ["orders"],
        headers: {
          type: "object",
          additionalProperties: true,
          properties: {
            "idempotency-key": { type: "string", description: "Client-supplied key; retries replay the original response." },
          },
        },
        body: bodySchema,
        response: {
          201: orderResponse,
          400: errorResponse, // invalid body, dup/unknown product, missing coords
          402: errorResponse, // payment declined
          409: errorResponse, // no single warehouse can fulfil
          422: errorResponse, // Idempotency-Key reused with a different payload
        },
      },
    },
    (request, reply) => controller.create(request, reply),
  );
}
