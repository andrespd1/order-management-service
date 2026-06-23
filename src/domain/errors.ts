// Business errors raised by the use-cases. The HTTP layer maps each to a status (M6).
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

// One or more requested product ids don't exist.
export class ProductNotFoundError extends DomainError {}

// No single warehouse can fill the whole order.
export class NoFulfillableWarehouseError extends DomainError {}

// The payment provider declined the charge.
export class PaymentDeclinedError extends DomainError {}
