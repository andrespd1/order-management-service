import { createHash } from "node:crypto";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import type { CreateOrder, CreateOrderCommand } from "../../application/create-order.js";
import type { Order } from "../../application/ports/order-repository.js";
import type { IdempotencyStore } from "../../application/ports/idempotency-store.js";
import {
  IdempotencyConflictError,
  IdempotencyKeyMismatchError,
  ValidationError,
} from "../../domain/errors.js";
import { mapError } from "../error-mapper.js";

interface CreateOrderBody {
  customerId: string;
  shippingAddress: CreateOrderCommand["shippingAddress"];
  items: { productId: string; quantity: number }[];
  payment: { cardNumber: string };
}

// HTTP inbound adapter: translates the request into a use-case command and the result back,
// and applies Idempotency-Key handling (an HTTP request-replay concern). No business logic.
export class OrderController {
  constructor(
    private readonly createOrder: CreateOrder,
    private readonly idempotency: IdempotencyStore,
  ) {}

  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = request.body as CreateOrderBody;

    // JSON Schema can't express "distinct by productId", so enforce it here.
    const productIds = body.items.map((i) => i.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new ValidationError("items must contain distinct productIds");
    }

    const key = headerValue(request.headers["idempotency-key"]);
    if (!key) {
      await reply.code(201).send(await this.process(body, undefined));
      return;
    }

    const fingerprint = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const outcome = await this.idempotency.begin(key, fingerprint);
    if (outcome.type === "replay") {
      await reply.code(outcome.status).send(outcome.body);
      return;
    }
    if (outcome.type === "mismatch") {
      throw new IdempotencyKeyMismatchError("Idempotency-Key reused with a different payload");
    }
    if (outcome.type === "in-progress") {
      throw new IdempotencyConflictError("A request with this Idempotency-Key is already in progress");
    }

    // outcome.type === "new": we own the key. Record any terminal outcome (success or a
    // deterministic 4xx) so retries replay it; free the key only on an unexpected 5xx.
    try {
      const order = await this.process(body, key);
      await this.idempotency.complete(key, 201, JSON.parse(JSON.stringify(order)));
      await reply.code(201).send(order);
    } catch (err) {
      const mapped = mapError(err as FastifyError);
      const finalize =
        mapped.status >= 500
          ? this.idempotency.release(key)
          : this.idempotency.complete(key, mapped.status, {
              error: { code: mapped.code, message: mapped.message },
            });
      await finalize.catch(() => undefined); // best-effort: never mask the original error
      throw err;
    }
  }

  private process(body: CreateOrderBody, idempotencyKey: string | undefined): Promise<Order> {
    const command: CreateOrderCommand = {
      customerId: body.customerId,
      shippingAddress: body.shippingAddress,
      items: body.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      cardNumber: body.payment.cardNumber,
      idempotencyKey,
    };
    return this.createOrder.execute(command);
  }
}

function headerValue(header: string | string[] | undefined): string | undefined {
  return typeof header === "string" ? header : undefined;
}
