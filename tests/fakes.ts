import type { GeoPoint } from "../src/domain/distance.js";
import type { CustomerRepository } from "../src/application/ports/customer-repository.js";
import type { Geocoder, PostalAddress } from "../src/application/ports/geocoder.js";
import type { ProductPrice, ProductRepository } from "../src/application/ports/product-repository.js";
import type {
  RequestedItem,
  WarehouseLocation,
  WarehouseRepository,
} from "../src/application/ports/warehouse-repository.js";
import type {
  Order,
  OrderRepository,
  ReserveOrderInput,
} from "../src/application/ports/order-repository.js";
import type { ChargeInput, ChargeOutcome, PaymentGateway } from "../src/application/ports/payment-gateway.js";
import type { IdempotencyOutcome, IdempotencyStore } from "../src/application/ports/idempotency-store.js";

export class FakeGeocoder implements Geocoder {
  readonly calls: PostalAddress[] = [];
  constructor(private readonly point: GeoPoint = { latitude: 0, longitude: 0 }) {}
  geocode(address: PostalAddress): Promise<GeoPoint> {
    this.calls.push(address);
    return Promise.resolve(this.point);
  }
}

export class FakeCustomerRepository implements CustomerRepository {
  // Defaults to "every customer exists"; pass a set of ids to restrict (e.g. to test 404s).
  constructor(private readonly known?: Set<string>) {}
  exists(id: string): Promise<boolean> {
    return Promise.resolve(this.known ? this.known.has(id) : true);
  }
}

export class FakeProductRepository implements ProductRepository {
  constructor(private readonly prices: Record<string, number>) {}
  findByIds(ids: string[]): Promise<ProductPrice[]> {
    const found = ids.filter((id) => id in this.prices).map((id) => ({ id, price: this.prices[id]! }));
    return Promise.resolve(found);
  }
}

export class FakeWarehouseRepository implements WarehouseRepository {
  constructor(private readonly candidates: WarehouseLocation[]) {}
  findWarehousesStockingAll(_items: RequestedItem[]): Promise<WarehouseLocation[]> {
    return Promise.resolve(this.candidates);
  }
}

export class FakeOrderRepository implements OrderRepository {
  readonly reserved: ReserveOrderInput[] = [];
  readonly released: string[] = [];
  private readonly orders = new Map<string, Order>();
  private seq = 0;
  private failuresLeft: number;

  // failuresBeforeSuccess lets a test exercise the use-case's retry-on-lost-race loop.
  constructor(failuresBeforeSuccess = 0) {
    this.failuresLeft = failuresBeforeSuccess;
  }

  reserveAndCreate(input: ReserveOrderInput): Promise<Order | null> {
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      return Promise.resolve(null);
    }
    this.reserved.push(input);
    const order: Order = {
      id: `order-${++this.seq}`,
      status: "PENDING",
      customerId: input.customerId,
      warehouseId: input.warehouseId,
      totalAmount: input.totalAmount,
      currency: "USD",
      paymentTransactionId: null,
      items: input.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
      createdAt: new Date(0),
    };
    this.orders.set(order.id, order);
    return Promise.resolve(order);
  }

  markPaid(orderId: string, transactionId: string): Promise<Order> {
    const paid: Order = { ...this.orders.get(orderId)!, status: "PAID", paymentTransactionId: transactionId };
    this.orders.set(orderId, paid);
    return Promise.resolve(paid);
  }

  releaseReservation(orderId: string): Promise<void> {
    this.released.push(orderId);
    const order = this.orders.get(orderId);
    if (order) this.orders.set(orderId, { ...order, status: "PAYMENT_FAILED" });
    return Promise.resolve();
  }
}

export class FakePaymentGateway implements PaymentGateway {
  constructor(private readonly approve = true) {}
  charge(_input: ChargeInput): Promise<ChargeOutcome> {
    return Promise.resolve(
      this.approve
        ? { status: "approved", transactionId: "txn-fake" }
        : { status: "declined", reason: "card_declined" },
    );
  }
}

export class FakeIdempotencyStore implements IdempotencyStore {
  private readonly store = new Map<string, { fingerprint: string; status?: number; body?: unknown }>();

  begin(key: string, fingerprint: string): Promise<IdempotencyOutcome> {
    const existing = this.store.get(key);
    if (!existing) {
      this.store.set(key, { fingerprint });
      return Promise.resolve({ type: "new" });
    }
    if (existing.fingerprint !== fingerprint) return Promise.resolve({ type: "mismatch" });
    if (existing.status === undefined) return Promise.resolve({ type: "in-progress" });
    return Promise.resolve({ type: "replay", status: existing.status, body: existing.body });
  }

  complete(key: string, status: number, body: unknown): Promise<void> {
    const existing = this.store.get(key);
    if (existing) this.store.set(key, { ...existing, status, body });
    return Promise.resolve();
  }

  release(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }
}
