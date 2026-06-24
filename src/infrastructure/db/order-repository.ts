import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  Order,
  OrderRepository,
  ReserveOrderInput,
} from "../../application/ports/order-repository.js";

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

// Thrown to roll the reservation transaction back when a line loses the stock race.
// Private to the adapter; surfaced to the use-case as a null return.
class ReservationRace extends Error {}

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async reserveAndCreate(input: ReserveOrderInput): Promise<Order | null> {
    // Decrement in a deterministic order (by productId) so concurrent orders touching the
    // same SKUs always lock rows in the same order and can't deadlock each other.
    const lines = [...input.lines].sort((a, b) => a.productId.localeCompare(b.productId));

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        for (const line of lines) {
          // Optimistic conditional decrement.
          const { count } = await tx.inventory.updateMany({
            where: {
              warehouseId: input.warehouseId,
              productId: line.productId,
              quantity: { gte: line.quantity },
            },
            data: { quantity: { decrement: line.quantity } },
          });
          if (count === 0) throw new ReservationRace();
        }
        return tx.order.create({
          data: {
            customerId: input.customerId,
            warehouseId: input.warehouseId,
            status: "PENDING",
            shipLine1: input.shippingAddress.line1,
            shipCity: input.shippingAddress.city,
            shipRegion: input.shippingAddress.region ?? null,
            shipPostalCode: input.shippingAddress.postalCode ?? null,
            shipCountry: input.shippingAddress.country,
            shipLatitude: input.shippingAddress.latitude,
            shipLongitude: input.shippingAddress.longitude,
            totalAmount: input.totalAmount,
            idempotencyKey: input.idempotencyKey ?? null,
            items: {
              create: lines.map((l) => ({
                productId: l.productId,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
              })),
            },
          },
          include: { items: true },
        });
      });
      return toOrder(order);
    } catch (err) {
      if (err instanceof ReservationRace) return null;
      throw err;
    }
  }

  async markPaid(orderId: string, transactionId: string): Promise<Order> {
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: "PAID", paymentTransactionId: transactionId },
      include: { items: true },
    });
    return toOrder(order);
  }

  async releaseReservation(orderId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { items: true },
      });
      // Restore stock in the same productId order as reserveAndCreate, to avoid deadlocks.
      const items = [...order.items].sort((a, b) => a.productId.localeCompare(b.productId));
      for (const item of items) {
        await tx.inventory.update({
          where: {
            warehouseId_productId: { warehouseId: order.warehouseId, productId: item.productId },
          },
          data: { quantity: { increment: item.quantity } },
        });
      }
      await tx.order.update({ where: { id: orderId }, data: { status: "PAYMENT_FAILED" } });
    });
  }
}

function toOrder(o: OrderWithItems): Order {
  return {
    id: o.id,
    status: o.status,
    customerId: o.customerId,
    warehouseId: o.warehouseId,
    totalAmount: o.totalAmount,
    currency: o.currency,
    paymentTransactionId: o.paymentTransactionId,
    items: o.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    })),
    createdAt: o.createdAt,
  };
}
