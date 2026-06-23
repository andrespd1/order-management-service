import type { PrismaClient } from "@prisma/client";
import type {
  RequestedItem,
  WarehouseLocation,
  WarehouseRepository,
} from "../../application/ports/warehouse-repository.js";

export class PrismaWarehouseRepository implements WarehouseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findWarehousesStockingAll(items: RequestedItem[]): Promise<WarehouseLocation[]> {
    if (items.length === 0) return [];

    // One query: inventory rows where some requested product is stocked in sufficient
    // quantity, each carrying its warehouse's location (no second round-trip).
    const rows = await this.prisma.inventory.findMany({
      where: { OR: items.map((i) => ({ productId: i.productId, quantity: { gte: i.quantity } })) },
      select: { warehouse: { select: { id: true, latitude: true, longitude: true } } },
    });

    // (warehouseId, productId) is unique, so a warehouse with one matching row per requested
    // product has exactly items.length rows here — meaning it stocks the whole order.
    const seen = new Map<string, { location: WarehouseLocation; count: number }>();
    for (const { warehouse } of rows) {
      const entry = seen.get(warehouse.id);
      if (entry) entry.count += 1;
      else seen.set(warehouse.id, { location: warehouse, count: 1 });
    }

    return [...seen.values()].filter((e) => e.count === items.length).map((e) => e.location);
  }
}
