// Outbound port for warehouse/inventory persistence. Adapter lives in infrastructure/db.
export interface RequestedItem {
  productId: string;
  quantity: number;
}

export interface WarehouseLocation {
  id: string;
  latitude: number;
  longitude: number;
}

export interface WarehouseRepository {
  // Warehouses stocking every requested item in sufficient quantity. Items have distinct productIds.
  findWarehousesStockingAll(items: RequestedItem[]): Promise<WarehouseLocation[]>;
}
