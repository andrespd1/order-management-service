// Outbound port for reading customer data. Adapter lives in infrastructure/db.
export interface CustomerRepository {
  exists(id: string): Promise<boolean>;
}
