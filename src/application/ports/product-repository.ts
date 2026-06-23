// Outbound port for reading product data. Adapter lives in infrastructure/db.
export interface ProductPrice {
  id: string;
  price: number; // minor units (cents)
}

export interface ProductRepository {
  findByIds(ids: string[]): Promise<ProductPrice[]>;
}
