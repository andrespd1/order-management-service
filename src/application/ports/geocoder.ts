import type { GeoPoint } from "../../domain/distance.js";
import type { PostalAddress } from "../../domain/address.js";

export type { PostalAddress };

// Outbound port: turn a postal address into coordinates. The mock adapter lives in
// infrastructure/geocoding; a real provider (Google/Mapbox/…) is a one-line swap at the
// composition root, with the use-case unchanged.
export interface Geocoder {
  geocode(address: PostalAddress): Promise<GeoPoint>;
}
