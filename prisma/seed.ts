import process from "node:process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Fixed IDs so README curls and inventory references stay stable across reseeds.
const W = {
  bogota: "11111111-1111-1111-1111-111111111111",
  medellin: "22222222-2222-2222-2222-222222222222",
  cali: "33333333-3333-3333-3333-333333333333",
};
const P = {
  mouse: "aaaaaaaa-0000-0000-0000-000000000001",
  keyboard: "aaaaaaaa-0000-0000-0000-000000000002",
  hub: "aaaaaaaa-0000-0000-0000-000000000003",
  stand: "aaaaaaaa-0000-0000-0000-000000000004",
};
const C = {
  a: "cccccccc-0000-0000-0000-000000000001",
  b: "cccccccc-0000-0000-0000-000000000002",
};

const warehouses = [
  { id: W.bogota, name: "Bogotá DC", latitude: 4.711, longitude: -74.0721 },
  { id: W.medellin, name: "Medellín DC", latitude: 6.2476, longitude: -75.5658 },
  { id: W.cali, name: "Cali DC", latitude: 3.4516, longitude: -76.532 },
];

const products = [
  { id: P.mouse, sku: "MOU-001", name: "Wireless Mouse", price: 1999 },
  { id: P.keyboard, sku: "KEY-001", name: "Mechanical Keyboard", price: 7999 },
  { id: P.hub, sku: "HUB-001", name: "USB-C Hub", price: 4599 },
  { id: P.stand, sku: "STA-001", name: "Laptop Stand", price: 2999 },
];

const customers = [
  { id: C.a, name: "Customer A", email: "a@example.com" },
  { id: C.b, name: "Customer B", email: "b@example.com" },
];

// Overlapping-but-not-identical stock so warehouse selection is actually exercised:
//   Bogotá  stocks mouse + keyboard
//   Medellín stocks all four
//   Cali    stocks mouse + hub + stand
const inventory = [
  { warehouseId: W.bogota, productId: P.mouse, quantity: 100 },
  { warehouseId: W.bogota, productId: P.keyboard, quantity: 50 },
  { warehouseId: W.medellin, productId: P.mouse, quantity: 100 },
  { warehouseId: W.medellin, productId: P.keyboard, quantity: 50 },
  { warehouseId: W.medellin, productId: P.hub, quantity: 80 },
  { warehouseId: W.medellin, productId: P.stand, quantity: 10 },
  { warehouseId: W.cali, productId: P.mouse, quantity: 100 },
  { warehouseId: W.cali, productId: P.hub, quantity: 80 },
  { warehouseId: W.cali, productId: P.stand, quantity: 10 },
];

async function main() {
  // Upserts keep the seed idempotent — re-running resets quantities without duplicating rows.
  for (const w of warehouses) {
    await prisma.warehouse.upsert({ where: { id: w.id }, update: w, create: w });
  }
  for (const p of products) {
    await prisma.product.upsert({ where: { id: p.id }, update: p, create: p });
  }
  for (const c of customers) {
    await prisma.customer.upsert({ where: { id: c.id }, update: c, create: c });
  }
  for (const i of inventory) {
    await prisma.inventory.upsert({
      where: { warehouseId_productId: { warehouseId: i.warehouseId, productId: i.productId } },
      update: { quantity: i.quantity },
      create: i,
    });
  }

  console.log(
    `Seeded: ${warehouses.length} warehouses, ${products.length} products, ` +
      `${customers.length} customers, ${inventory.length} inventory rows.`,
  );
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
