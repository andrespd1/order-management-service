import { describe, it, expect } from "vitest";
import { CreateOrder, type CreateOrderCommand } from "../src/application/create-order.js";
import {
  CustomerNotFoundError,
  NoFulfillableWarehouseError,
  PaymentDeclinedError,
  ProductNotFoundError,
} from "../src/domain/errors.js";
import {
  FakeCustomerRepository,
  FakeGeocoder,
  FakeOrderRepository,
  FakePaymentGateway,
  FakeProductRepository,
  FakeWarehouseRepository,
} from "./fakes.js";

const MOUSE = "aaaaaaaa-0000-0000-0000-000000000001";
const WAREHOUSE = { id: "w1", latitude: 0, longitude: 0 };

function command(): CreateOrderCommand {
  return {
    customerId: "c1",
    shippingAddress: { line1: "1 Main", city: "Bogotá", country: "CO", latitude: 0, longitude: 0 },
    items: [{ productId: MOUSE, quantity: 2 }],
    cardNumber: "4111111111111111",
  };
}

describe("CreateOrder use-case", () => {
  it("creates a PAID order on the happy path, total computed server-side", async () => {
    const orders = new FakeOrderRepository();
    const useCase = new CreateOrder({
      geocoder: new FakeGeocoder(),
      customers: new FakeCustomerRepository(),
      products: new FakeProductRepository({ [MOUSE]: 1999 }),
      warehouses: new FakeWarehouseRepository([WAREHOUSE]),
      orders,
      payments: new FakePaymentGateway(true),
    });

    const order = await useCase.execute(command());

    expect(order.status).toBe("PAID");
    expect(order.totalAmount).toBe(3998); // 2 x 1999, not trusted from the client
    expect(orders.released).toEqual([]); // no compensation on success
  });

  it("compensates (restores the reservation) when payment is declined", async () => {
    const orders = new FakeOrderRepository();
    const useCase = new CreateOrder({
      geocoder: new FakeGeocoder(),
      customers: new FakeCustomerRepository(),
      products: new FakeProductRepository({ [MOUSE]: 1999 }),
      warehouses: new FakeWarehouseRepository([WAREHOUSE]),
      orders,
      payments: new FakePaymentGateway(false),
    });

    await expect(useCase.execute(command())).rejects.toBeInstanceOf(PaymentDeclinedError);
    expect(orders.released).toEqual(["order-1"]); // compensated the order it just created
  });

  it("retries after losing a stock race, then succeeds", async () => {
    const orders = new FakeOrderRepository(1); // first reserve loses the race, second wins
    const useCase = new CreateOrder({
      geocoder: new FakeGeocoder(),
      customers: new FakeCustomerRepository(),
      products: new FakeProductRepository({ [MOUSE]: 1999 }),
      warehouses: new FakeWarehouseRepository([WAREHOUSE]),
      orders,
      payments: new FakePaymentGateway(true),
    });

    const order = await useCase.execute(command());

    expect(order.status).toBe("PAID");
    expect(orders.reserved).toHaveLength(1); // only the successful (second) attempt
  });

  it("throws NoFulfillableWarehouse when no warehouse can fill the order", async () => {
    const useCase = new CreateOrder({
      geocoder: new FakeGeocoder(),
      customers: new FakeCustomerRepository(),
      products: new FakeProductRepository({ [MOUSE]: 1999 }),
      warehouses: new FakeWarehouseRepository([]),
      orders: new FakeOrderRepository(),
      payments: new FakePaymentGateway(true),
    });

    await expect(useCase.execute(command())).rejects.toBeInstanceOf(NoFulfillableWarehouseError);
  });

  it("throws ProductNotFound for an unknown product id", async () => {
    const useCase = new CreateOrder({
      geocoder: new FakeGeocoder(),
      customers: new FakeCustomerRepository(),
      products: new FakeProductRepository({}),
      warehouses: new FakeWarehouseRepository([WAREHOUSE]),
      orders: new FakeOrderRepository(),
      payments: new FakePaymentGateway(true),
    });

    await expect(useCase.execute(command())).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it("rejects an unknown customer up front, before reserving or charging", async () => {
    const orders = new FakeOrderRepository();
    const useCase = new CreateOrder({
      geocoder: new FakeGeocoder(),
      customers: new FakeCustomerRepository(new Set()), // knows no customers
      products: new FakeProductRepository({ [MOUSE]: 1999 }),
      warehouses: new FakeWarehouseRepository([WAREHOUSE]),
      orders,
      payments: new FakePaymentGateway(true),
    });

    await expect(useCase.execute(command())).rejects.toBeInstanceOf(CustomerNotFoundError);
    expect(orders.reserved).toEqual([]); // short-circuited: no stock reserved, nothing charged
  });

  it("geocodes the shipping address when coordinates are omitted", async () => {
    const orders = new FakeOrderRepository();
    const geocoder = new FakeGeocoder({ latitude: 6.25, longitude: -75.57 });
    const useCase = new CreateOrder({
      geocoder,
      customers: new FakeCustomerRepository(),
      products: new FakeProductRepository({ [MOUSE]: 1999 }),
      warehouses: new FakeWarehouseRepository([WAREHOUSE]),
      orders,
      payments: new FakePaymentGateway(true),
    });

    const order = await useCase.execute({
      customerId: "c1",
      shippingAddress: { line1: "1 Main", city: "Medellín", country: "CO" }, // no coordinates
      items: [{ productId: MOUSE, quantity: 1 }],
      cardNumber: "4111111111111111",
    });

    expect(order.status).toBe("PAID");
    expect(geocoder.calls).toHaveLength(1); // consulted because coordinates were absent
    expect(orders.reserved[0]?.shippingAddress).toMatchObject({ latitude: 6.25, longitude: -75.57 });
  });
});
