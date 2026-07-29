/**
 * Queue — dispatch matching
 *
 * Pure scoring logic. No network, no Supabase imports, so it unit tests
 * directly and is shared by both the emergency and scheduled flows.
 *
 * The two flows differ only in parameters (see DispatchPolicy), not in code
 * path. Scheduled transport is emergency dispatch with a longer offer TTL, a
 * sequential strategy, and a future reference time.
 *
 * Tiers are plain strings to match the project's text + CHECK convention
 * (as with appointments.status and booking_mode), not Postgres enums.
 */

export type UnitTier = "PTS" | "BLS" | "ALS" | "CCT";

const TIER_RANK: Record<UnitTier, number> = { PTS: 0, BLS: 1, ALS: 2, CCT: 3 };

export const tierRank = (t: UnitTier) => TIER_RANK[t];

/** Effective care level is limited by whichever of vehicle or crew is lower. */
export function effectiveTier(vehicle: UnitTier, crew: UnitTier): UnitTier {
  return tierRank(vehicle) <= tierRank(crew) ? vehicle : crew;
}

export interface TransportRequest {
  id: string;
  requestType: "emergency" | "scheduled";
  triageLevel: number | null;         // 1 critical .. 5 non urgent
  requiredTier: UnitTier;
  requiredCapabilities: string[];
  /** Reference instant: now for emergency, scheduled_for for planned jobs. */
  referenceTime: number;
  destinationHospitalId: string | null;
  estimatedJobDurationSec: number;
}

export interface Candidate {
  unitId: string;
  providerId: string;
  providerType: "hospital_fleet" | "third_party";
  providerHospitalId: string | null;
  reliabilityScore: number;           // 0..1
  vehicleTier: UnitTier;
  crewTier: UnitTier;
  capabilities: string[];
  /** Road ETA to the pickup point. Null means the routing call failed. */
  etaSeconds: number | null;
  straightLineMeters: number;
  shiftEndsAt: number;                // epoch ms
  lastDispatchedAt: number | null;    // epoch ms, for fairness tie break
}

export interface DispatchPolicy {
  strategy: "broadcast" | "sequential";
  broadcastSize: number;
  offerTtlSeconds: number;
  maxRounds: number;
  searchRadiusMeters: number[];       // one entry per round, widening
  /** Suppress in network preference — clinical need outranks commercial. */
  applyNetworkPreference: boolean;
}

/**
 * Policy is derived from triage, not hardcoded at the call site, so the
 * clinical rules live in exactly one readable place.
 */
export function policyFor(req: TransportRequest): DispatchPolicy {
  if (req.requestType === "scheduled") {
    return {
      strategy: "sequential",
      broadcastSize: 1,
      offerTtlSeconds: 600,
      maxRounds: 6,
      searchRadiusMeters: [15000, 25000, 40000, 40000, 60000, 60000],
      applyNetworkPreference: true,
    };
  }

  const triage = req.triageLevel ?? 3;

  if (triage <= 2) {
    return {
      strategy: "broadcast",
      broadcastSize: 3,
      offerTtlSeconds: 30,
      maxRounds: 3,
      searchRadiusMeters: [10000, 20000, 35000],
      // Never let fleet ownership steer a critical call.
      applyNetworkPreference: false,
    };
  }

  return {
    strategy: "sequential",
    broadcastSize: 1,
    offerTtlSeconds: 60,
    maxRounds: 3,
    searchRadiusMeters: [8000, 18000, 30000],
    applyNetworkPreference: true,
  };
}

// ---------------------------------------------------------------------------
// hard filters
// ---------------------------------------------------------------------------

export type RejectReason =
  | "tier_too_low"
  | "missing_capability"
  | "shift_too_short"
  | "no_eta";

export function hardFilter(
  req: TransportRequest,
  c: Candidate,
): RejectReason | null {
  const eff = effectiveTier(c.vehicleTier, c.crewTier);
  if (tierRank(eff) < tierRank(req.requiredTier)) return "tier_too_low";

  for (const cap of req.requiredCapabilities) {
    if (!c.capabilities.includes(cap)) return "missing_capability";
  }

  // A crew timing out mid transport is worse than a slower ETA, so a unit that
  // cannot finish the job inside its shift is excluded outright, not penalized.
  const etaMs = (c.etaSeconds ?? estimateEtaSeconds(c.straightLineMeters)) * 1000;
  const finishesAt = req.referenceTime + etaMs + req.estimatedJobDurationSec * 1000;
  if (finishesAt > c.shiftEndsAt) return "shift_too_short";

  if (c.etaSeconds === null && c.straightLineMeters <= 0) return "no_eta";

  return null;
}

/**
 * Fallback only, used when the routing provider fails. Deliberately pessimistic:
 * in dense traffic the road distance and the achievable speed are both worse
 * than a naive straight line estimate suggests.
 */
export function estimateEtaSeconds(straightLineMeters: number): number {
  const ROAD_WINDING_FACTOR = 1.4;
  const ASSUMED_KMH = 22;
  const roadMeters = straightLineMeters * ROAD_WINDING_FACTOR;
  return Math.round((roadMeters / 1000 / ASSUMED_KMH) * 3600);
}

// ---------------------------------------------------------------------------
// scoring
// ---------------------------------------------------------------------------

export const WEIGHTS = {
  eta: 0.45,
  capabilityFit: 0.20,
  shiftHeadroom: 0.15,
  network: 0.12,
  reliability: 0.08,
} as const;

/** Normalizes ETA against a 20 minute horizon; beyond that everything is bad. */
export function etaScore(etaSeconds: number): number {
  const HORIZON = 20 * 60;
  return clamp01(1 - etaSeconds / HORIZON);
}

/**
 * Exact tier match is best. Over provisioning is penalized because sending the
 * only CCT unit on a routine discharge leaves nothing for the transfer that
 * actually needs it.
 */
export function capabilityFitScore(req: TransportRequest, c: Candidate): number {
  const gap = tierRank(effectiveTier(c.vehicleTier, c.crewTier)) -
    tierRank(req.requiredTier);
  if (gap === 0) return 1;
  if (gap === 1) return 0.7;
  if (gap === 2) return 0.4;
  return 0.2;
}

export function shiftHeadroomScore(req: TransportRequest, c: Candidate): number {
  const eta = c.etaSeconds ?? estimateEtaSeconds(c.straightLineMeters);
  const needMs = (eta + req.estimatedJobDurationSec) * 1000;
  const availableMs = c.shiftEndsAt - req.referenceTime;
  if (needMs <= 0) return 1;
  const ratio = availableMs / needMs;
  // 1.3x cover is comfortable; below that, confidence falls away fast.
  return clamp01((ratio - 1) / 0.3);
}

export function networkScore(req: TransportRequest, c: Candidate): number {
  if (!req.destinationHospitalId) return 0.5;
  if (c.providerType !== "hospital_fleet") return 0.4;
  return c.providerHospitalId === req.destinationHospitalId ? 1 : 0.4;
}

export interface ScoredCandidate extends Candidate {
  score: number;
  resolvedEtaSeconds: number;
  breakdown: Record<string, number>;
}

export function scoreCandidate(
  req: TransportRequest,
  c: Candidate,
  policy: DispatchPolicy,
): ScoredCandidate {
  const eta = c.etaSeconds ?? estimateEtaSeconds(c.straightLineMeters);

  const parts = {
    eta: etaScore(eta),
    capabilityFit: capabilityFitScore(req, c),
    shiftHeadroom: shiftHeadroomScore(req, c),
    network: policy.applyNetworkPreference ? networkScore(req, c) : 0,
    reliability: clamp01(c.reliabilityScore),
  };

  // When network preference is suppressed, its weight is redistributed to ETA
  // rather than silently shrinking every score.
  const w = policy.applyNetworkPreference
    ? WEIGHTS
    : { ...WEIGHTS, network: 0, eta: WEIGHTS.eta + WEIGHTS.network };

  const score =
    w.eta * parts.eta +
    w.capabilityFit * parts.capabilityFit +
    w.shiftHeadroom * parts.shiftHeadroom +
    w.network * parts.network +
    w.reliability * parts.reliability;

  return { ...c, score, resolvedEtaSeconds: eta, breakdown: parts };
}

/**
 * Fairness tie break. Among third party providers whose scores are close, prefer
 * the one dispatched least recently — otherwise a single well positioned
 * operator takes most of the volume and the rest leave the marketplace.
 */
const TIE_BREAK_EPSILON = 0.02;

export function rankCandidates(
  req: TransportRequest,
  candidates: Candidate[],
  policy: DispatchPolicy,
): ScoredCandidate[] {
  const scored = candidates
    .filter((c) => hardFilter(req, c) === null)
    .map((c) => scoreCandidate(req, c, policy));

  return scored.sort((a, b) => {
    if (Math.abs(a.score - b.score) > TIE_BREAK_EPSILON) return b.score - a.score;
    const aLast = a.lastDispatchedAt ?? 0;
    const bLast = b.lastDispatchedAt ?? 0;
    if (aLast !== bLast) return aLast - bLast;
    return b.score - a.score;
  });
}

/** One unit per provider per broadcast — do not offer the same job to three
 *  vehicles from one operator and none to anyone else. */
export function selectOffers(
  ranked: ScoredCandidate[],
  policy: DispatchPolicy,
): ScoredCandidate[] {
  if (policy.strategy === "sequential") return ranked.slice(0, 1);

  const picked: ScoredCandidate[] = [];
  const seenProviders = new Set<string>();

  for (const c of ranked) {
    if (picked.length >= policy.broadcastSize) break;
    if (seenProviders.has(c.providerId)) continue;
    seenProviders.add(c.providerId);
    picked.push(c);
  }

  // If provider diversity left us short, backfill with the next best units.
  for (const c of ranked) {
    if (picked.length >= policy.broadcastSize) break;
    if (!picked.includes(c)) picked.push(c);
  }

  return picked;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
