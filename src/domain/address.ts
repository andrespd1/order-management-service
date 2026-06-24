// A postal address with no coordinates — the shared shape behind a shipping address and the
// geocoder input. Pair it with a GeoPoint (see distance.ts) to get a located ShippingAddress.
export interface PostalAddress {
  line1: string;
  city: string;
  region?: string;
  postalCode?: string;
  country: string;
}
