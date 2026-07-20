// Per-cut-point model snapshots for the historical forecast. Each cut is a full
// replay over "the pre-tournament CSV plus the first n World Cup matches", so the
// ratings, the calibration curve and the confederation offsets are all truncated
// at the same instant. No algorithm lives here: every cut goes through the same
// replay() that produces sim-model.json.

import { CONFED_OF, DATASET_NAME, replay } from './elo.mjs'

const WC_START = '2026-06-11'
export const HOST_OF = { USA: 'US', CAN: 'CA', MEX: 'MX' }

/** one World Cup match as a row in the dataset's own column order:
 *  date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
 *  (city and country are never read by replay(), so they stay empty) */
export function csvRow(m, venues) {
  const vc = venues[m.venueId]?.country
  let h = m.home
  let a = m.away
  // the dataset's neutral=FALSE hands HOME_ADV to whoever sits in the home_team
  // column, so a host playing as the away side must be swapped into it. Swapping
  // both the teams and their scores leaves the Elo update, the calibration bins
  // and the cross-confederation sample identical.
  if (HOST_OF[a.code] === vc) {
    h = m.away
    a = m.home
  }
  const neutral = HOST_OF[h.code] === vc ? 'FALSE' : 'TRUE'
  return [
    m.date.slice(0, 10),
    DATASET_NAME[h.code],
    DATASET_NAME[a.code],
    h.score,
    a.score,
    'FIFA World Cup',
    '',
    '',
    neutral,
  ].join(',')
}

/** matches with a real, final score, in kickoff order: these are the cut points.
 *  status === 'finished' excludes a match still in progress: update.mjs writes its
 *  running score unconditionally, and the engine only ever keeps a match real once
 *  it has finished, so a live scoreline must not become a cut point either. */
export function playedInOrder(matches) {
  return matches
    .filter(
      (m) =>
        m.status === 'finished' &&
        m.home?.code &&
        m.away?.code &&
        m.home.score != null &&
        m.away.score != null,
    )
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
}

/**
 * @param csv      the raw international_results CSV
 * @param matches  matches.json's `matches` array
 * @param venues   venues.json's `venues` map
 * @param f        frozen FIFA points by team code (shared by every cut)
 */
export function buildHistory(csv, matches, venues, f) {
  const lines = csv.split('\n')
  // drop only World Cup 2026 rows: those come from matches.json instead, because only
  // it carries kickoff times, and per-match cut points need that ordering. A row dated
  // on or after the cutoff but from some other tournament (a concurrent qualifier,
  // friendly, etc.) is not a World Cup row and still counts, the same as any row
  // dated before the cutoff.
  const preWc = lines
    .filter((l, i) => {
      if (i === 0) return true
      if (!l) return false
      const cols = l.split(',')
      return cols[0] < WC_START || cols[5] !== 'FIFA World Cup'
    })
    .join('\n')
  const played = playedInOrder(matches)
  const rows = played.map((m) => csvRow(m, venues))

  const cuts = []
  for (let n = 0; n <= played.length; n++) {
    // cut n folds in the first n matches. Their order inside a single day does not
    // matter: no team plays twice in a day, so same-day updates touch disjoint pairs.
    const { ratings, outcomeCurve, offsets } = replay([preWc, ...rows.slice(0, n)].join('\n'))
    cuts.push({
      n,
      after: n === 0 ? null : played[n - 1].date,
      curve: outcomeCurve.map((b) => ({ w: +b.w.toFixed(4), d: +b.d.toFixed(4) })),
      teams: Object.fromEntries(
        Object.keys(DATASET_NAME)
          .filter((c) => ratings.get(DATASET_NAME[c]) != null)
          .map((c) => [c, Math.round(ratings.get(DATASET_NAME[c]) + (offsets[CONFED_OF[c]] ?? 0))]),
      ),
    })
  }
  return { cuts, hostBonus: 60, f }
}
