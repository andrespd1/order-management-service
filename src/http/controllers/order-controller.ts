import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateOrder, CreateOrderCommand } from "../../application/create-order.js";
import { ValidationError } from "../../domain/errors.js";

interface CreateOrderBody {
  customerId: string;
  shippingAddress: CreateOrderCommand["shippingAddress"];
  items: { productId: string; quantity: number }[];
  payment: { cardNumber: string };
}

// HTTP inbound adapter: translates the request into a use-case command and the result back.
// No business logic here — that lives in the CreateOrder use-case.
export class OrderController {
  constructor(private readonly createOrder: CreateOrder) {}

  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = request.body as CreateOrderBody;

    // JSON Schema can't express "distinct by productId", so enforce it here.
    const productIds = body.items.map((i) => i.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new ValidationError("items must contain distinct productIds");
    }

    const idempotencyKey = request.headers["idempotency-key"];
    const command: CreateOrderCommand = {
      customerId: body.customerId,
      shippingAddress: body.shippingAddress,
      items: body.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      cardNumber: body.payment.cardNumber,
      idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey : undefined,
    };

    const order = await this.createOrder.execute(command);
    await reply.code(201).send(order);
  }
}
