import type { PrismaClient } from "@prisma/client";
import type { ProductPrice, ProductRepository } from "../../application/ports/product-repository.js";

export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByIds(ids: string[]): Promise<ProductPrice[]> {
    return this.prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, price: true } });
  }
}
