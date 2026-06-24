import type { PrismaClient } from "@prisma/client";
import type { CustomerRepository } from "../../application/ports/customer-repository.js";

export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async exists(id: string): Promise<boolean> {
    const found = await this.prisma.customer.findUnique({ where: { id }, select: { id: true } });
    return found !== null;
  }
}
