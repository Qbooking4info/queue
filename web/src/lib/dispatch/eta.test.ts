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

// ---------------------------------------------------------------------------
// Alert relay
//
// dispatcher_alerts had 12 rows in production and 9 never acknowledged. The
// relay exists so a critical alert reaches a phone, and so an alerting failure
// can never take down the dispatch round that raised it.
// ---------------------------------------------------------------------------

import { formatAlert, relayDispatchAlert, alertRelayConfigured } from "./alert-relay";

describe("alert relay", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.DISPATCH_ALERT_WEBHOOK_URL;
    delete process.env.DISPATCH_ALERT_SMS_URL;
    delete process.env.DISPATCH_ALERT_SMS_TO;
    vi.restoreAllMocks();
  });
  afterEach(() => { process.env = { ...saved }; });

  const alert = {
    requestId: "r1", severity: "critical" as const, kind: "no_unit_available",
    message: "Nothing in range", bookingRef: "AMB-1", triageLevel: 1,
    contactPhone: "+2348000000000",
  };

  it("formats one actionable line", () => {
    const line = formatAlert(alert);
    expect(line).toContain("CRITICAL");
    expect(line).toContain("AMB-1");
    expect(line).toContain("triage 1");
    expect(line).toContain("+2348000000000");
  });

  it("is a no-op when nothing is configured", async () => {
    expect(alertRelayConfigured()).toBe(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await relayDispatchAlert(alert);
    expect(fetchSpy).not.toHaveBeenCalled();   // and, crucially, did not throw
  });

  it("posts to the webhook when configured", async () => {
    process.env.DISPATCH_ALERT_WEBHOOK_URL = "https://hook.test/x";
    const fetchSpy = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    await relayDispatchAlert(alert);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("prefers a per-recipient number over the on-call list", async () => {
    process.env.DISPATCH_ALERT_SMS_URL = "https://sms.test/send";
    process.env.DISPATCH_ALERT_SMS_TO = "+2340000000000";
    let body: { to?: string[] } = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response("ok", { status: 200 });
    }));
    await relayDispatchAlert({ ...alert, smsTo: ["+2341111111111"] });
    // A crew member who cannot be pushed to gets the message, not the whole desk.
    expect(body.to).toEqual(["+2341111111111"]);
  });

  // The point of the whole module: it runs inside dispatch.
  it("never throws when the channel is dead", async () => {
    process.env.DISPATCH_ALERT_WEBHOOK_URL = "https://hook.test/x";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await expect(relayDispatchAlert(alert)).resolves.toBeUndefined();
  });
});
