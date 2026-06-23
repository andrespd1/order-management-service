import { prisma } from "./client.js";
import type { ProductPrice, ProductRepository } from "../../application/ports/product-repository.js";

export class PrismaProductRepository implements ProductRepository {
  findByIds(ids: string[]): Promise<ProductPrice[]> {
    return prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, price: true } });
  }
}
