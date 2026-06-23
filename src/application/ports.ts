// Ports the application depends on; adapters in infrastructure/ implement them.

export interface ChargeInput {
  cardNumber: string;
  amount: number; // minor units (cents)
  description: string;
  idempotencyKey?: string;
}

export type ChargeOutcome =
  | { status: "approved"; transactionId: string }
  | { status: "declined"; reason: string };

export interface PaymentGateway {
  charge(input: ChargeInput): Promise<ChargeOutcome>;
}
