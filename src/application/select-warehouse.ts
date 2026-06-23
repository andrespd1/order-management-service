import { haversineKm, type GeoPoint } from "../domain/distance.js";
import type {
  RequestedItem,
  WarehouseLocation,
  WarehouseRepository,
} from "./ports/warehouse-repository.js";

// Nearest point to the origin, or null if there are none. Ties resolve to the first seen.
export function pickNearest<T extends GeoPoint>(points: T[], origin: GeoPoint): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const point of points) {
    const distance = haversineKm(origin, point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  return best;
}

// The single warehouse that fills the whole order, closest to the destination; null if none fit.
export async function selectWarehouse(
  repo: WarehouseRepository,
  items: RequestedItem[],
  destination: GeoPoint,
): Promise<WarehouseLocation | null> {
  const candidates = await repo.findWarehousesStockingAll(items);
  return pickNearest(candidates, destination);
}
