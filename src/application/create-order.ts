import {
  CustomerNotFoundError,
  NoFulfillableWarehouseError,
  PaymentDeclinedError,
  ProductNotFoundError,
} from "../domain/errors.js";
import type { GeoPoint } from "../domain/distance.js";
import { selectWarehouse } from "./select-warehouse.js";
import type { CustomerRepository } from "./ports/customer-repository.js";
import type { PaymentGateway } from "./ports/payment-gateway.js";
import type { ProductRepository } from "./ports/product-repository.js";
import type { RequestedItem, WarehouseRepository } from "./ports/warehouse-repository.js";
import type {
  Order,
  OrderLine,
  OrderRepository,
  ShippingAddress,
} from "./ports/order-repository.js";

export interface CreateOrderCommand {
  customerId: string;
  shippingAddress: ShippingAddress;
  items: RequestedItem[]; // distinct productIds, positive quantities (enforced at the boundary)
  cardNumber: string;
  idempotencyKey?: string;
}

export interface CreateOrderDeps {
  customers: CustomerRepository;
  products: ProductRepository;
  warehouses: WarehouseRepository;
  orders: OrderRepository;
  payments: PaymentGateway;
}

// Use-case interactor — deps injected once at the composition root.
export class CreateOrder {
  constructor(private readonly deps: CreateOrderDeps) {}

  async execute(command: CreateOrderCommand): Promise<Order> {
    const { customers, products, warehouses, orders, payments } = this.deps;

    // 0. Reject unknown customers up front; otherwise the FK trips deep in the insert and
    //    surfaces as a 500 instead of a clean 4xx.
    if (!(await customers.exists(command.customerId))) {
      throw new CustomerNotFoundError(`Unknown customer: ${command.customerId}`);
    }

    // 1. Price the order from the server's catalogue (never trust the client for money).
    const found = await products.findByIds(command.items.map((i) => i.productId));
    const priceById = new Map(found.map((p) => [p.id, p.price]));
    const lines: OrderLine[] = command.items.map((item) => {
      const unitPrice = priceById.get(item.productId);
      if (unitPrice === undefined) {
        throw new ProductNotFoundError(`Unknown product: ${item.productId}`);
      }
      return { productId: item.productId, quantity: item.quantity, unitPrice };
    });
    const totalAmount = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    const destination: GeoPoint = command.shippingAddress;

    // 2. Reserve at the nearest fulfilling warehouse. On a lost stock race, re-select and
    //    retry once (stock may have shifted); a genuine no-candidate isn't retried.
    let order: Order | null = null;
    for (let attempt = 0; attempt < 2 && !order; attempt++) {
      const warehouse = await selectWarehouse(warehouses, command.items, destination);
      if (!warehouse) break;
      order = await orders.reserveAndCreate({
        customerId: command.customerId,
        warehouseId: warehouse.id,
        shippingAddress: command.shippingAddress,
        lines,
        totalAmount,
        idempotencyKey: command.idempotencyKey,
      });
    }
    if (!order) throw new NoFulfillableWarehouseError("No single warehouse can fulfil this order");

    // 3. Charge outside the transaction, then confirm or compensate.
    const outcome = await payments.charge({
      cardNumber: command.cardNumber,
      amount: totalAmount,
      description: `Order ${order.id}`,
      idempotencyKey: command.idempotencyKey,
    });
    if (outcome.status === "declined") {
      await orders.releaseReservation(order.id);
      throw new PaymentDeclinedError(`Payment declined: ${outcome.reason}`);
    }
    return orders.markPaid(order.id, outcome.transactionId);
  }
}
