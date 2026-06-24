import { prisma } from "./infrastructure/db/client.js";
import { PrismaCustomerRepository } from "./infrastructure/db/customer-repository.js";
import { PrismaProductRepository } from "./infrastructure/db/product-repository.js";
import { PrismaWarehouseRepository } from "./infrastructure/db/warehouse-repository.js";
import { PrismaOrderRepository } from "./infrastructure/db/order-repository.js";
import { PrismaIdempotencyStore } from "./infrastructure/db/idempotency-store.js";
import { MockPaymentGateway } from "./infrastructure/payment/mock-payment-gateway.js";
import { CreateOrder } from "./application/create-order.js";
import { OrderController } from "./http/controllers/order-controller.js";
import type { Controllers } from "./http/server.js";

// Composition root: the single place the object graph is wired —
// the shared Prisma client, adapters -> use-cases -> controllers. Add a feature by extending this map.
export function buildControllers(): Controllers {
  const createOrder = new CreateOrder({
    customers: new PrismaCustomerRepository(prisma),
    products: new PrismaProductRepository(prisma),
    warehouses: new PrismaWarehouseRepository(prisma),
    orders: new PrismaOrderRepository(prisma),
    payments: new MockPaymentGateway(),
  });

  return {
    orders: new OrderController(createOrder, new PrismaIdempotencyStore(prisma)),
  };
}
