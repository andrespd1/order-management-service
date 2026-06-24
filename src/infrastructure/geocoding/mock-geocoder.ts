import type { GeoPoint } from "../../domain/distance.js";
import type { Geocoder, PostalAddress } from "../../application/ports/geocoder.js";

// Deterministic stand-in for a real geocoding provider. Resolves the seed cities exactly and
// falls back to a country centroid (then 0,0) so every address resolves — a real adapter would
// instead surface a "no match" failure. Swap this for a real client in the composition root.
const CITY_COORDS: Record<string, GeoPoint> = {
  bogota: { latitude: 4.711, longitude: -74.0721 },
  medellin: { latitude: 6.2476, longitude: -75.5658 },
  cali: { latitude: 3.4516, longitude: -76.532 },
};

const COUNTRY_CENTROID: Record<string, GeoPoint> = {
  CO: { latitude: 4.5709, longitude: -74.2973 },
};

export class MockGeocoder implements Geocoder {
  geocode(address: PostalAddress): Promise<GeoPoint> {
    const coords =
      CITY_COORDS[normalizeCity(address.city)] ??
      COUNTRY_CENTROID[address.country.toUpperCase()] ?? { latitude: 0, longitude: 0 };
    return Promise.resolve(coords);
  }
}

// Lowercase and strip accents so "Bogota" and "Bogotá" map to the same key. NFD splits an
// accented letter into base + combining diacritic, which the regex then removes.
function normalizeCity(city: string): string {
  return city.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}
