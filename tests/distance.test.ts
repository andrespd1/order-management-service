import { describe, it, expect } from "vitest";
import { haversineKm } from "../src/domain/distance.js";
import { pickNearest } from "../src/application/select-warehouse.js";

describe("haversineKm", () => {
  it("is ~0 for identical points", () => {
    expect(haversineKm({ latitude: 4.7, longitude: -74 }, { latitude: 4.7, longitude: -74 })).toBeCloseTo(0);
  });

  it("matches the known Bogotá → Medellín distance (~240 km)", () => {
    const d = haversineKm({ latitude: 4.711, longitude: -74.0721 }, { latitude: 6.2476, longitude: -75.5658 });
    expect(d).toBeGreaterThan(220);
    expect(d).toBeLessThan(260);
  });
});

describe("pickNearest", () => {
  it("returns the closest point to the origin", () => {
    const near = { id: "near", latitude: 4.7, longitude: -74 };
    const far = { id: "far", latitude: 6.2, longitude: -75.5 };
    expect(pickNearest([far, near], { latitude: 4.7, longitude: -74 })?.id).toBe("near");
  });

  it("returns null when there are no candidates", () => {
    expect(pickNearest([], { latitude: 0, longitude: 0 })).toBeNull();
  });
});
