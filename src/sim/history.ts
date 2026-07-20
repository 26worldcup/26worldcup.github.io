// Historical model snapshots: what the forecast knew at a given instant.
// Produced by scripts/simhistory.mjs, one cut per played World Cup match.

import type { SimModel } from './engine'

export interface SimHistoryCut {
  n: number
  /** kickoff of the n-th match; null for the pre-tournament baseline */
  after: string | null
  curve: SimModel['curve']
  /** confederation offsets already folded in, same as sim-model.json's `r` */
  teams: Record<string, number>
}

export interface SimHistory {
  cuts: SimHistoryCut[]
  hostBonus: number
  /** FIFA points are frozen for the whole tournament, so one copy serves every cut */
  f: Record<string, number | null>
}

/** local-midnight cutoff for a calendar day: the instant just before any of that
 *  day's matches could have kicked off. Forecast's date mode and MatchSimulator's
 *  rating-day picker both mean this by "that day's ratings", so both call here
 *  instead of keeping their own copy of the rule. */
export function dayCutoffMs(day: string): number {
  return new Date(`${day}T00:00:00`).getTime()
}

/** the cut in force at `cutoffMs`: the latest one whose match kicked off strictly
 *  earlier. The same "strictly earlier" boundary drives Forecast's keepReal
 *  predicate, so the matches folded into these ratings are exactly the matches
 *  whose real results are kept. Callers that only need the timestamp for a label
 *  use this directly rather than re-deriving the lookup. */
export function cutAt(history: SimHistory, cutoffMs: number): SimHistoryCut {
  let cut = history.cuts[0]
  for (const c of history.cuts) {
    if (c.after == null || Date.parse(c.after) < cutoffMs) cut = c
    else break
  }
  return cut
}

/** the model as of `cutoffMs`, assembled from that instant's cut */
export function modelAt(history: SimHistory, cutoffMs: number): SimModel {
  const cut = cutAt(history, cutoffMs)
  return {
    curve: cut.curve,
    hostBonus: history.hostBonus,
    teams: Object.fromEntries(
      Object.entries(cut.teams).map(([code, r]) => [code, { r, f: history.f[code] ?? null }]),
    ),
  }
}
