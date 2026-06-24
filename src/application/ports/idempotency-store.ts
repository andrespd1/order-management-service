// Outbound port for idempotent request handling. Adapter lives in infrastructure/db.

export type IdempotencyOutcome =
  | { type: "new" } // key claimed; the caller should process the request
  | { type: "replay"; status: number; body: unknown } // already completed; replay this response
  | { type: "mismatch" } // same key, different request payload
  | { type: "in-progress" }; // claimed but not yet completed (a concurrent duplicate)

export interface IdempotencyStore {
  // Atomically claim the key; the outcome tells the caller how to proceed.
  begin(key: string, fingerprint: string): Promise<IdempotencyOutcome>;
  // Record the final response so future calls with this key replay it.
  complete(key: string, status: number, body: unknown): Promise<void>;
  // Drop a claim whose processing failed, so the request can be retried.
  release(key: string): Promise<void>;
}
