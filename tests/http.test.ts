import { afterEach, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/http/server.js";
import { CreateOrder } from "../src/application/create-order.js";
import { OrderController } from "../src/http/controllers/order-controller.js";
import {
  FakeCustomerRepository,
  FakeGeocoder,
  FakeIdempotencyStore,
  FakeOrderRepository,
  FakePaymentGateway,
  FakeProductRepository,
  FakeWarehouseRepository,
} from "./fakes.js";

const MOUSE = "aaaaaaaa-0000-0000-0000-000000000001";
const CUSTOMER = "cccccccc-0000-0000-0000-000000000001";
const validBody = {
  customerId: CUSTOMER,
  shippingAddress: { line1: "1 Main", city: "Bogotá", country: "CO", latitude: 4.711, longitude: -74.0721 },
  items: [{ productId: MOUSE, quantity: 1 }],
  payment: { cardNumber: "4111111111111111" },
};

let app: FastifyInstance;
let orders: FakeOrderRepository;

afterEach(() => app.close());

async function setup(opts: { approve?: boolean; customerExists?: boolean } = {}): Promise<void> {
  orders = new FakeOrderRepository();
  const customers =
    opts.customerExists === false ? new FakeCustomerRepository(new Set()) : new FakeCustomerRepository();
  const useCase = new CreateOrder({
    geocoder: new FakeGeocoder(),
    customers,
    products: new FakeProductRepository({ [MOUSE]: 1999 }),
    warehouses: new FakeWarehouseRepository([{ id: "w1", latitude: 0, longitude: 0 }]),
    orders,
    payments: new FakePaymentGateway(opts.approve ?? true),
  });
  app = await buildServer({ orders: new OrderController(useCase, new FakeIdempotencyStore()) });
}

describe("POST /orders", () => {
  it("201 with a PAID order for a valid request", async () => {
    await setup();
    const res = await app.inject({ method: "POST", url: "/orders", payload: validBody });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("PAID");
  });

  it("402 when payment is declined", async () => {
    await setup({ approve: false });
    const res = await app.inject({ method: "POST", url: "/orders", payload: validBody });
    expect(res.statusCode).toBe(402);
    expect(res.json().error.code).toBe("PAYMENT_DECLINED");
  });

  it("400 with CUSTOMER_NOT_FOUND for an unknown customer", async () => {
    await setup({ customerExists: false });
    const res = await app.inject({ method: "POST", url: "/orders", payload: validBody });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("CUSTOMER_NOT_FOUND");
    expect(orders.reserved).toHaveLength(0); // rejected before any reservation
  });

  it("201 and geocodes when shipping coordinates are omitted", async () => {
    await setup();
    const res = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { ...validBody, shippingAddress: { line1: "1 Main", city: "Bogotá", country: "CO" } },
    });
    expect(res.statusCode).toBe(201);
  });

  it("400 when only one of latitude/longitude is provided", async () => {
    await setup();
    const res = await app.inject({
      method: "POST",
      url: "/orders",
      payload: {
        ...validBody,
        shippingAddress: { line1: "1 Main", city: "Bogotá", country: "CO", latitude: 4.7 },
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("replays the same response for a repeated Idempotency-Key, running the use-case once", async () => {
    await setup();
    const headers = { "idempotency-key": "key-1" };
    const first = await app.inject({ method: "POST", url: "/orders", payload: validBody, headers });
    const second = await app.inject({ method: "POST", url: "/orders", payload: validBody, headers });
    expect(second.statusCode).toBe(201);
    expect(second.json().id).toBe(first.json().id); // same order, not a new one
    expect(orders.reserved).toHaveLength(1); // the use-case ran exactly once
  });

  it("422 when the same Idempotency-Key is reused with a different body", async () => {
    await setup();
    const headers = { "idempotency-key": "key-2" };
    await app.inject({ method: "POST", url: "/orders", payload: validBody, headers });
    const res = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { ...validBody, items: [{ productId: MOUSE, quantity: 2 }] },
      headers,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});
