import type { FastifyError } from "fastify";
import {
  NoFulfillableWarehouseError,
  PaymentDeclinedError,
  ProductNotFoundError,
  ValidationError,
} from "../domain/errors.js";

// Maps any thrown error to its HTTP status, stable code, and client-facing message.
// Unrecognised errors become a 500 — the caller logs those.
export function mapError(error: FastifyError): { status: number; code: string; message: string } {
  if (error.validation || error instanceof ValidationError) {
    return { status: 400, code: "VALIDATION_ERROR", message: error.message };
  }
  if (error instanceof ProductNotFoundError) {
    return { status: 400, code: "PRODUCT_NOT_FOUND", message: error.message };
  }
  if (error instanceof NoFulfillableWarehouseError) {
    return { status: 409, code: "NO_FULFILLABLE_WAREHOUSE", message: error.message };
  }
  if (error instanceof PaymentDeclinedError) {
    return { status: 402, code: "PAYMENT_DECLINED", message: error.message };
  }
  return { status: 500, code: "INTERNAL_ERROR", message: "Internal server error" };
}
