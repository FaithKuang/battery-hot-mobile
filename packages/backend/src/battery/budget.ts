/** Pure USD nano-dollar accounting for a $0.20 Asia/Shanghai daily DeepSeek cap. */
export const DAILY_LIMIT_NANO_USD = 200_000_000;

export interface BatteryBudgetState {
  days: Record<string, { spentNanoUsd: number; reservedNanoUsd: number }>;
  reservations: Record<string, {
    dayKey: string;
    roundId: string;
    reservedNanoUsd: number;
    offPeak: boolean;
    status: "pending" | "unknown";
  }>;
  disabledRounds: string[];
}

export interface ReserveRequest {
  now: Date;
  roundId: string;
  requestId: string;
  hasKey: boolean;
  offPeak: boolean;
  maxInputTokens: number;
  maxOutputTokens: number;
}

export type ReserveDecision =
  | { kind: "call"; state: BatteryBudgetState; reservedNanoUsd: number; dayKey: string }
  | { kind: "free-mode"; state: BatteryBudgetState; reason: "no-key" | "budget-exhausted" | "http402" | "already-reserved" };

export type Settlement =
  | { kind: "usage"; inputTokens: number; outputTokens: number; cachedInputTokens?: number; cachedInputUsdPerMillion?: number }
  | { kind: "unknown" }
  | { kind: "http402" }
  | { kind: "rejected-no-charge" };

export function emptyBatteryBudget(): BatteryBudgetState {
  return { days: {}, reservations: {}, disabledRounds: [] };
}

export function shanghaiDateKey(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new RangeError("Invalid date");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function validTokens(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Token count must be a nonnegative safe integer");
}

function tokenCost(input: number, output: number, offPeak: boolean, cached = 0, cachedUsdPerMillion?: number): number {
  validTokens(input); validTokens(output); validTokens(cached);
  if (cached > input) throw new RangeError("Cached input exceeds total input");
  const missRate = offPeak ? 150 : 300; // $0.15/$0.30 per 1M -> nano-USD per token
  const outputRate = offPeak ? 600 : 1200; // $0.60/$1.20 per 1M
  const cachedRate = cachedUsdPerMillion === undefined ? missRate : cachedUsdPerMillion * 1000;
  if (!Number.isFinite(cachedRate) || cachedRate < 0 || cachedRate > missRate) {
    throw new RangeError("Cached input price must be between zero and miss price");
  }
  const cost = (input - cached) * missRate + cached * cachedRate + output * outputRate;
  if (!Number.isSafeInteger(Math.ceil(cost))) throw new RangeError("Estimated charge is too large");
  return Math.ceil(cost);
}

export function deepSeekCostNanoUsd(inputTokens: number, outputTokens: number): number {
  return tokenCost(inputTokens, outputTokens, false);
}

/** Reserve the worst case before a call. Cached input is priced as a miss until actual usage is known. */
export function reserveDeepSeekCall(state: BatteryBudgetState, request: ReserveRequest): ReserveDecision {
  const dayKey = shanghaiDateKey(request.now);
  if (!request.hasKey) return { kind: "free-mode", state, reason: "no-key" };
  if (state.disabledRounds.includes(request.roundId)) return { kind: "free-mode", state, reason: "http402" };
  if (state.reservations[request.requestId]) return { kind: "free-mode", state, reason: "already-reserved" };
  if (!request.roundId || !request.requestId) throw new RangeError("Round and request IDs are required");
  const reservedNanoUsd = tokenCost(request.maxInputTokens, request.maxOutputTokens, request.offPeak);
  if (!reservedNanoUsd) throw new RangeError("Estimated call cost must be positive");
  const day = state.days[dayKey] ?? { spentNanoUsd: 0, reservedNanoUsd: 0 };
  if (day.spentNanoUsd + day.reservedNanoUsd + reservedNanoUsd > DAILY_LIMIT_NANO_USD) {
    return { kind: "free-mode", state, reason: "budget-exhausted" };
  }
  return {
    kind: "call", dayKey, reservedNanoUsd,
    state: {
      ...state,
      days: { ...state.days, [dayKey]: { ...day, reservedNanoUsd: day.reservedNanoUsd + reservedNanoUsd } },
      reservations: {
        ...state.reservations,
        [request.requestId]: { dayKey, roundId: request.roundId, reservedNanoUsd, offPeak: request.offPeak, status: "pending" },
      },
    },
  };
}

/** Unknown outcome keeps its hold; a known rejection releases it; usage charges the originating day. */
export function settleDeepSeekCall(state: BatteryBudgetState, requestId: string, settlement: Settlement): BatteryBudgetState {
  const reservation = state.reservations[requestId];
  if (!reservation) throw new RangeError("No reservation for request");
  if (settlement.kind === "unknown") {
    return {
      ...state,
      reservations: { ...state.reservations, [requestId]: { ...reservation, status: "unknown" } },
    };
  }
  const charge = settlement.kind === "usage"
    ? tokenCost(settlement.inputTokens, settlement.outputTokens, reservation.offPeak,
      settlement.cachedInputTokens, settlement.cachedInputUsdPerMillion)
    : 0;
  const day = state.days[reservation.dayKey]!;
  const { [requestId]: _closed, ...remaining } = state.reservations;
  return {
    ...state,
    days: {
      ...state.days,
      [reservation.dayKey]: {
        spentNanoUsd: day.spentNanoUsd + charge,
        reservedNanoUsd: day.reservedNanoUsd - reservation.reservedNanoUsd,
      },
    },
    reservations: remaining,
    disabledRounds: settlement.kind === "http402" && !state.disabledRounds.includes(reservation.roundId)
      ? [...state.disabledRounds, reservation.roundId] : state.disabledRounds,
  };
}

export function remainingDailyNanoUsd(state: BatteryBudgetState, now: Date): number {
  const day = state.days[shanghaiDateKey(now)];
  return Math.max(0, DAILY_LIMIT_NANO_USD - (day?.spentNanoUsd ?? 0) - (day?.reservedNanoUsd ?? 0));
}
