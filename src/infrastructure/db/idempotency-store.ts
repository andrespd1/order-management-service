import { Prisma, type PrismaClient } from "@prisma/client";
import type { IdempotencyOutcome, IdempotencyStore } from "../../application/ports/idempotency-store.js";

export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(private readonly prisma: PrismaClient) {}

  async begin(key: string, fingerprint: string): Promise<IdempotencyOutcome> {
    // The primary-key insert is the atomic claim: it succeeds for a fresh key and
    // conflicts (P2002) when the key already exists.
    try {
      await this.prisma.idempotencyKey.create({ data: { key, requestFingerprint: fingerprint } });
      return { type: "new" };
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
      const existing = await this.prisma.idempotencyKey.findUnique({ where: { key } });
      // Raced with a concurrent release that deleted the claim — ask the caller to retry.
      if (!existing) return { type: "in-progress" };
      if (existing.requestFingerprint !== fingerprint) return { type: "mismatch" };
      if (existing.responseStatus === null) return { type: "in-progress" };
      return { type: "replay", status: existing.responseStatus, body: existing.responseBody };
    }
  }

  async complete(key: string, status: number, body: unknown): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: { key },
      data: { responseStatus: status, responseBody: body as Prisma.InputJsonValue },
    });
  }

  async release(key: string): Promise<void> {
    await this.prisma.idempotencyKey.delete({ where: { key } });
  }
}
