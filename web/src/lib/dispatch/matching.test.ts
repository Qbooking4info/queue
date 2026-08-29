import { describe, it, expect } from "vitest";
import {
  effectiveTier, hardFilter, policyFor, rankCandidates, selectOffers,
  estimateEtaSeconds, rejectionTally, type Candidate, type TransportRequest,
} from "./matching";

const NOW = Date.UTC(2026, 6, 29, 10, 0, 0);
const MIN = 60_000;

const baseReq = (o: Partial<TransportRequest> = {}): TransportRequest => ({
  id: "r1",
  requestType: "emergency",
  triageLevel: 3,
  requiredTier: "BLS",
  requiredCapabilities: [],
  referenceTime: NOW,
  destinationHospitalId: "hosp-A",
  estimatedJobDurationSec: 45 * 60,
  ...o,
});

const unit = (o: Partial<Candidate> = {}): Candidate => ({
  unitId: "u1",
  providerId: "p1",
  providerType: "third_party",
  providerHospitalId: null,
  reliabilityScore: 0.8,
  vehicleTier: "ALS",
  crewTier: "ALS",
  capabilities: ["oxygen"],
  etaSeconds: 6 * 60,
  straightLineMeters: 3000,
  shiftEndsAt: NOW + 8 * 60 * MIN,
  lastDispatchedAt: null,
  ...o,
});

describe("effective tier", () => {
  it("crew caps vehicle", () => {
    expect(effectiveTier("ALS", "BLS")).toBe("BLS");
  });
  it("vehicle caps crew", () => {
    expect(effectiveTier("PTS", "CCT")).toBe("PTS");
  });
});

describe("hard filters", () => {
  it("rejects tier too low", () => {
    expect(hardFilter(baseReq({ requiredTier: "CCT" }), unit())).toBe("tier_too_low");
  });
  it("rejects missing capability", () => {
    expect(hardFilter(baseReq({ requiredCapabilities: ["incubator"] }), unit())).toBe("missing_capability");
  });
  it("ALS vehicle with basic crew fails an ALS request", () => {
    expect(hardFilter(baseReq({ requiredTier: "ALS" }), unit({ crewTier: "BLS" }))).toBe("tier_too_low");
  });
  it("rejects a shift ending mid job", () => {
    expect(hardFilter(baseReq(), unit({ shiftEndsAt: NOW + 20 * MIN }))).toBe("shift_too_short");
  });
  it("passes a healthy unit", () => {
    expect(hardFilter(baseReq(), unit())).toBeNull();
  });
});

describe("eta fallback", () => {
  it("is pessimistic vs a 60kmh ideal", () => {
    expect(estimateEtaSeconds(5000)).toBeGreaterThan(300);
  });
});

describe("ranking", () => {
  it("ranks the nearer unit first", () => {
    const ranked = rankCandidates(baseReq(), [
      unit({ unitId: "far", etaSeconds: 18 * 60 }),
      unit({ unitId: "near", etaSeconds: 4 * 60, providerId: "p2" }),
    ], policyFor(baseReq()));
    expect(ranked[0].unitId).toBe("near");
  });

  it("prefers exact tier over over-provisioned at equal ETA", () => {
    const req = baseReq({ requiredTier: "PTS" });
    const ranked = rankCandidates(req, [
      unit({ unitId: "cct", vehicleTier: "CCT", crewTier: "CCT" }),
      unit({ unitId: "pts", vehicleTier: "PTS", crewTier: "PTS", providerId: "p2" }),
    ], policyFor(req));
    expect(ranked[0].unitId).toBe("pts");
  });
});

describe("network preference", () => {
  it("lets in-network win a near tie on triage 4", () => {
    const t4 = baseReq({ triageLevel: 4 });
    const ranked = rankCandidates(t4, [
      unit({ unitId: "inNetwork", providerType: "hospital_fleet", providerHospitalId: "hosp-A" }),
      unit({ unitId: "thirdParty", providerId: "p2", etaSeconds: 6 * 60 + 20 }),
    ], policyFor(t4));
    expect(ranked[0].unitId).toBe("inNetwork");
  });

  it("ignores ownership on triage 1, picks fastest", () => {
    const t1 = baseReq({ triageLevel: 1 });
    const ranked = rankCandidates(t1, [
      unit({ unitId: "inNetworkSlow", providerType: "hospital_fleet", providerHospitalId: "hosp-A", etaSeconds: 11 * 60 }),
      unit({ unitId: "thirdPartyFast", providerId: "p2", etaSeconds: 5 * 60 }),
    ], policyFor(t1));
    expect(ranked[0].unitId).toBe("thirdPartyFast");
  });
});

describe("fairness tie break", () => {
  it("prefers the least recently dispatched unit on a near tie", () => {
    const ranked = rankCandidates(baseReq(), [
      unit({ unitId: "busy", providerId: "p1", lastDispatchedAt: NOW - 5 * MIN }),
      unit({ unitId: "idle", providerId: "p2", lastDispatchedAt: NOW - 300 * MIN }),
    ], policyFor(baseReq()));
    expect(ranked[0].unitId).toBe("idle");
  });
});

describe("offer selection", () => {
  const t1 = baseReq({ triageLevel: 1 });
  const critPolicy = policyFor(t1);
  const many = rankCandidates(t1, [
    unit({ unitId: "a1", providerId: "pX", etaSeconds: 4 * 60 }),
    unit({ unitId: "a2", providerId: "pX", etaSeconds: 5 * 60 }),
    unit({ unitId: "b1", providerId: "pY", etaSeconds: 6 * 60 }),
    unit({ unitId: "c1", providerId: "pZ", etaSeconds: 7 * 60 }),
  ], critPolicy);

  it("respects the broadcast size", () => {
    expect(selectOffers(many, critPolicy)).toHaveLength(3);
  });

  it("offers one unit per provider in a broadcast", () => {
    const offers = selectOffers(many, critPolicy);
    expect(new Set(offers.map((o) => o.providerId)).size).toBe(3);
  });

  it("offers exactly one unit sequentially", () => {
    const seqPolicy = policyFor(baseReq({ triageLevel: 4 }));
    expect(selectOffers(many, seqPolicy)).toHaveLength(1);
  });
});

describe("policy", () => {
  it("broadcasts on triage 1", () => {
    expect(policyFor(baseReq({ triageLevel: 1 })).strategy).toBe("broadcast");
  });
  it("uses a short TTL on triage 1", () => {
    expect(policyFor(baseReq({ triageLevel: 1 })).offerTtlSeconds).toBe(30);
  });
  it("is sequential with a long TTL for scheduled transport", () => {
    expect(policyFor(baseReq({ requestType: "scheduled", triageLevel: null })).offerTtlSeconds).toBe(600);
  });
});

// Feeds dispatch_attempts.reject_reasons, which is how a coverage gap gets told
// apart from a capacity problem. If this miscounts, supply decisions are made on
// wrong numbers — so it is pinned rather than trusted.
describe("rejection tally", () => {
  it("is empty when every unit is usable", () => {
    expect(rejectionTally(baseReq(), [unit(), unit({ unitId: "u2" })])).toEqual({});
  });

  it("counts units whose effective tier is below what was asked for", () => {
    const req = baseReq({ requiredTier: "CCT" });
    const tally = rejectionTally(req, [unit(), unit({ unitId: "u2" })]);
    expect(tally).toEqual({ tier_too_low: 2 });
  });

  it("counts a missing capability separately from a tier shortfall", () => {
    const req = baseReq({ requiredCapabilities: ["ventilator"] });
    expect(rejectionTally(req, [unit()])).toEqual({ missing_capability: 1 });
  });

  it("counts a crew that cannot finish inside its shift", () => {
    const short = unit({ shiftEndsAt: NOW + 5 * MIN });
    expect(rejectionTally(baseReq(), [short])).toEqual({ shift_too_short: 1 });
  });

  it("counts a unit with no usable position", () => {
    const lost = unit({ etaSeconds: null, straightLineMeters: 0 });
    expect(rejectionTally(baseReq(), [lost])).toEqual({ no_eta: 1 });
  });

  it("tallies several reasons across a mixed set", () => {
    const req = baseReq({ requiredTier: "CCT" });
    const tally = rejectionTally(req, [
      unit({ unitId: "a" }),
      unit({ unitId: "b" }),
      unit({ unitId: "c", vehicleTier: "CCT", crewTier: "CCT", shiftEndsAt: NOW + 5 * MIN }),
    ]);
    expect(tally).toEqual({ tier_too_low: 2, shift_too_short: 1 });
  });

  it("agrees with rankCandidates on how many survive", () => {
    const req = baseReq({ requiredTier: "CCT" });
    const candidates = [unit({ unitId: "a" }), unit({ unitId: "b", vehicleTier: "CCT", crewTier: "CCT" })];
    const rejected = Object.values(rejectionTally(req, candidates)).reduce((a, b) => a + b, 0);
    expect(candidates.length - rejected).toBe(rankCandidates(req, candidates, policyFor(req)).length);
  });
});

// ---------------------------------------------------------------------------
// Location staleness
//
// The 2-minute hard cutoff in find_candidate_units is why production went 11
// requests and 32 dispatch rounds without ever producing a single candidate.
// It is now a 10-minute outer bound with the difference priced here.
// ---------------------------------------------------------------------------

import { freshnessScore, LOCATION_STALENESS_FLOOR } from "./matching";

describe("freshnessScore", () => {
  it("does not penalise a fresh fix", () => {
    expect(freshnessScore(5)).toBe(1);
    expect(freshnessScore(30)).toBe(1);
  });

  it("never punishes a unit whose age is unknown", () => {
    // Older callers, or a routing path that didn't supply it, must not be
    // silently deprioritised into never being dispatched.
    expect(freshnessScore(undefined)).toBe(1);
    expect(freshnessScore(NaN)).toBe(1);
  });

  it("decays monotonically with age", () => {
    const a = freshnessScore(60), b = freshnessScore(240), c = freshnessScore(540);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it("floors rather than zeroing at the outer bound", () => {
    // The whole point: a stale unit is worth less, never worth nothing. Zero
    // here would reproduce the exclusion bug through the back door.
    expect(freshnessScore(600)).toBeCloseTo(LOCATION_STALENESS_FLOOR, 5);
    expect(freshnessScore(100000)).toBeGreaterThanOrEqual(LOCATION_STALENESS_FLOOR);
  });

  it("still ranks a stale nearby unit above nothing at all", () => {
    // A 9-minute-old fix retains most of its value; the old behaviour discarded
    // it entirely and told the patient no ambulance existed.
    expect(freshnessScore(540)).toBeGreaterThan(0.5);
  });
});
