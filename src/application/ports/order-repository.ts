// Outbound port for order persistence. Adapter lives in infrastructure/db.
// The reserve/markPaid/release methods each run as one atomic DB transaction —
// the use-case orchestrates them but never manages transactions itself.

export interface ShippingAddress {
  line1: string;
  city: string;
  region?: string;
  postalCode?: string;
  country: string;
  latitude: number;
  longitude: number;
}

export interface OrderLine {
  productId: string;
  quantity: number;
  unitPrice: number; // snapshot at order time
}

export interface ReserveOrderInput {
  customerId: string;
  warehouseId: string;
  shippingAddress: ShippingAddress;
  lines: OrderLine[];
  totalAmount: number;
  idempotencyKey?: string; // DB-level backstop: one order per key (unique column)
}

export type OrderStatus = "PENDING" | "PAID" | "PAYMENT_FAILED" | "CANCELLED";

export interface Order {
  id: string;
  status: OrderStatus;
  customerId: string;
  warehouseId: string;
  totalAmount: number;
  currency: string;
  paymentTransactionId: string | null;
  items: OrderLine[];
  createdAt: Date;
}

export interface OrderRepository {
  // Atomically decrement stock for each line at the warehouse and create a PENDING order.
  // Returns null if a line lost the stock race (caller may re-select and retry).
  reserveAndCreate(input: ReserveOrderInput): Promise<Order | null>;
  markPaid(orderId: string, transactionId: string): Promise<Order>;
  // Compensation: restore the order's reserved stock and mark it PAYMENT_FAILED.
  releaseReservation(orderId: string): Promise<void>;
}
