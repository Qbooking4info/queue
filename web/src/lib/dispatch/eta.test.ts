import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// eta.ts imports 'server-only', which throws outside a server component —
// same shim routing.test.ts uses.
vi.mock("server-only", () => ({}));
import { haversineMeters, roadEta, routingProvider } from "./eta";

// Lagos: Marina to Ikeja, ~17km straight line.
const MARINA = { lat: 6.4550, lng: 3.3841 };
const IKEJA = { lat: 6.6018, lng: 3.3515 };

describe("haversineMeters", () => {
  it("is zero for the same point", () => {
    expect(haversineMeters(MARINA, MARINA)).toBe(0);
  });

  it("matches a known Lagos distance within a few percent", () => {
    const d = haversineMeters(MARINA, IKEJA);
    expect(d).toBeGreaterThan(15_500);
    expect(d).toBeLessThan(17_500);
  });

  it("is symmetric", () => {
    expect(haversineMeters(MARINA, IKEJA)).toBe(haversineMeters(IKEJA, MARINA));
  });
});

describe("routingProvider", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it("is estimate-only when no key is configured", () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.MAPBOX_ACCESS_TOKEN;
    expect(routingProvider()).toBe("estimate");
  });

  it("prefers Google when both keys are present", () => {
    process.env.GOOGLE_MAPS_API_KEY = "x";
    process.env.MAPBOX_ACCESS_TOKEN = "y";
    expect(routingProvider()).toBe("google");
  });
});

describe("roadEta", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.MAPBOX_ACCESS_TOKEN;
    vi.restoreAllMocks();
  });
  afterEach(() => { process.env = { ...saved }; });

  it("falls back to the estimator with no provider configured", async () => {
    const r = await roadEta(MARINA, IKEJA);
    expect(r.source).toBe("estimate");
    expect(r.seconds).toBeGreaterThan(0);
  });

  it("uses Google's duration when the API answers", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ routes: [{ duration: "834s", distanceMeters: 9100 }] }),
      { status: 200 },
    )));

    const r = await roadEta(MARINA, IKEJA);
    expect(r).toEqual({ seconds: 834, source: "google", meters: 9100 });
  });

  // The point of the whole module: this runs on the emergency path, so a bad
  // minute at the routing provider must degrade to a number, never to nothing.
  it("falls back rather than throwing when the provider errors", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream on fire", { status: 500 })));

    const r = await roadEta(MARINA, IKEJA);
    expect(r.source).toBe("estimate");
    expect(r.seconds).toBeGreaterThan(0);
  });

  it("falls back when the provider throws outright", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));

    const r = await roadEta(MARINA, IKEJA);
    expect(r.source).toBe("estimate");
  });

  it("falls back when the provider answers with no usable route", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ routes: [] }), { status: 200 })));

    const r = await roadEta(MARINA, IKEJA);
    expect(r.source).toBe("estimate");
  });

  it("uses Mapbox when only that key is set", async () => {
    process.env.MAPBOX_ACCESS_TOKEN = "mb-token";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ routes: [{ duration: 612.4, distance: 8300.9 }] }),
      { status: 200 },
    )));

    const r = await roadEta(MARINA, IKEJA);
    expect(r).toEqual({ seconds: 612, source: "mapbox", meters: 8301 });
  });
});
