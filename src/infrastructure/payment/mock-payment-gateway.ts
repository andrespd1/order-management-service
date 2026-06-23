import { randomUUID } from "node:crypto";
import type { ChargeInput, ChargeOutcome, PaymentGateway } from "../../application/ports.js";

// Mock gateway. Approves by default; a card number ending in "0002" is declined, so the
// compensation path is exercisable. With an idempotency key the transaction id is derived
// from it, modelling an idempotent gateway (a retried charge returns the same transaction).
export class MockPaymentGateway implements PaymentGateway {
  charge(input: ChargeInput): Promise<ChargeOutcome> {
    const outcome: ChargeOutcome = input.cardNumber.endsWith("0002")
      ? { status: "declined", reason: "card_declined" }
      : {
          status: "approved",
          transactionId: input.idempotencyKey
            ? `mock_txn_${input.idempotencyKey}`
            : `mock_txn_${randomUUID()}`,
        };
    return Promise.resolve(outcome);
  }
}
