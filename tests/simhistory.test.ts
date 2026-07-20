import { expect, test } from 'bun:test'
import fs from 'node:fs'
import { CONFED_OF, DATASET_NAME } from '../scripts/elo.mjs'
import { buildHistory, csvRow, HOST_OF, playedInOrder } from '../scripts/simhistory.mjs'
import { pairProbs } from '../src/sim/engine'

test('DATASET_NAME covers all 48 finalists', () => {
  expect(Object.keys(DATASET_NAME)).toHaveLength(48)
  expect(DATASET_NAME.ARG).toBe('Argentina')
  expect(DATASET_NAME.USA).toBe('United States')
})

test('CONFED_OF resolves a confederation for every team', () => {
  expect(Object.keys(CONFED_OF)).toHaveLength(48)
  expect(CONFED_OF.ARG).toBe('CONMEBOL')
  expect(CONFED_OF.ESP).toBe('UEFA')
  expect(CONFED_OF.USA).toBe('CONCACAF')
  expect(CONFED_OF.JPN).toBe('AFC')
  expect(CONFED_OF.MAR).toBe('CAF')
})

const csv = fs.readFileSync('scripts/cache/intl-results.csv', 'utf8')
const matches = JSON.parse(fs.readFileSync('public/data/matches.json', 'utf8')).matches
const venues = JSON.parse(fs.readFileSync('public/data/venues.json', 'utf8')).venues
const simModel = JSON.parse(fs.readFileSync('public/data/sim-model.json', 'utf8'))
const probs = JSON.parse(fs.readFileSync('public/data/probs.json', 'utf8'))
const f = Object.fromEntries(Object.entries(simModel.teams).map(([c, v]) => [c, v.f]))

const played = playedInOrder(matches)
const history = buildHistory(csv, matches, venues, f)

test('one cut per played match, plus the pre-tournament baseline', () => {
  expect(history.cuts).toHaveLength(played.length + 1)
  expect(history.cuts[0].n).toBe(0)
  expect(history.cuts[0].after).toBeNull()
})

test('n is contiguous and `after` never goes backwards', () => {
  // not strictly increasing: the last group round kicks off simultaneously by
  // design (anti-collusion), which gives 12 tied timestamps
  for (let i = 1; i < history.cuts.length; i++) {
    expect(history.cuts[i].n).toBe(i)
    if (i > 1) {
      expect(Date.parse(history.cuts[i].after)).toBeGreaterThanOrEqual(
        Date.parse(history.cuts[i - 1].after),
      )
    }
  }
})

test('every cut carries all 48 teams and a 13-bin curve', () => {
  for (const cut of history.cuts) {
    expect(Object.keys(cut.teams)).toHaveLength(48)
    expect(cut.curve.length).toBe(13)
  }
})

// A shootout must enter the replay as its 120-minute draw; the penalty result must
// not leak in. The early-match tier below spans group-stage days only, so it never
// reaches a knockout match. Assert on the emitted row directly instead.
test('penalty-decided matches are recorded as draws', () => {
  const pens = matches.filter((m) => m.home?.pen != null && m.home.score != null)
  expect(pens.length).toBeGreaterThanOrEqual(4)
  for (const m of pens) {
    const c = csvRow(m, venues).split(',')
    expect(`#${m.n} ${c[3]}-${c[4]}`).toBe(`#${m.n} ${c[3]}-${c[3]}`)
  }
})

// csvRow swaps a host nation into the home_team column when it plays as the away
// side, because the dataset's neutral=FALSE hands the +100 home advantage to
// whoever sits there. The tight 0.5pp tier below only reaches the opening days and
// never hits one of these matches, so assert on the emitted row directly, the same
// technique the penalty test above uses. Matches found generically via the venue's
// country, not by hardcoding match numbers.
test('a host playing away is swapped into the home_team column', () => {
  const hostAway = matches.filter(
    (m) => m.home?.code && m.away?.code && HOST_OF[m.away.code] === venues[m.venueId]?.country,
  )
  expect(hostAway.length).toBeGreaterThanOrEqual(3)
  for (const m of hostAway) {
    const c = csvRow(m, venues).split(',')
    expect(`#${m.n} ${c[1]}`).toBe(`#${m.n} ${DATASET_NAME[m.away.code]}`)
    expect(`#${m.n} ${c[8]}`).toBe(`#${m.n} FALSE`)
  }
})

// Tier 1a, the exact oracle: pair the CSV of the day with the model produced that
// same day, both pinned in git. This tests buildHistory's arithmetic (filter
// boundary, offset folding, rounding) against an artifact the pipeline itself
// emitted. Passing an empty match array computes only cuts[0], skipping 104 replays.
test('the CSV as of 2026-06-11 reproduces that day committed model', () => {
  const baseline = JSON.parse(fs.readFileSync('tests/fixtures/sim-model-2026-06-11.json', 'utf8'))
  const csv0611 = Bun.spawnSync(['git', 'show', 'a46faa2:scripts/cache/intl-results.csv']).stdout.toString()
  if (!csv0611 || csv0611.length < 1e6) {
    throw new Error('cannot read the a46faa2 CSV; a shallow CI clone needs fetch-depth: 0')
  }
  const base = buildHistory(csv0611, [], venues, f).cuts[0].teams
  expect(Object.keys(base)).toHaveLength(48)
  for (const [code, v] of Object.entries(baseline.teams)) {
    expect(`${code}=${base[code]}`).toBe(`${code}=${v.r}`)
  }
})

// Tier 1b, a net over today's data. Upstream backfills and revises PRE-tournament
// rows too, so today's baseline should NOT equal the June snapshot: those backfilled
// fixtures really were played before the tournament, and counting them is more
// accurate, not less. Measured worst drift is 12 points (ALG, from a backfilled
// 2026-06-10 friendly). 25 only catches errors of magnitude.
test('today pre-tournament baseline drifts from the June snapshot only slightly', () => {
  const baseline = JSON.parse(fs.readFileSync('tests/fixtures/sim-model-2026-06-11.json', 'utf8'))
  const got = history.cuts[0].teams
  expect(Object.keys(got)).toHaveLength(48)
  const worst = Object.entries(baseline.teams)
    .map(([code, v]) => ({ code, drift: Math.abs(got[code] - v.r) }))
    .sort((a, b) => b.drift - a.drift)[0]
  console.log(`worst baseline drift ${worst.drift} points @ ${worst.code}`)
  expect(worst.drift).toBeLessThan(25)
})

/** largest gap, in percentage points, between a cut's probabilities for a match and
 *  the value probs.json froze at that match's kickoff */
function deviation(cutIndex, m) {
  const cut = history.cuts[cutIndex]
  const model = {
    curve: cut.curve,
    hostBonus: history.hostBonus,
    teams: Object.fromEntries(
      Object.entries(cut.teams).map(([c, r]) => [c, { r, f: history.f[c] ?? null }]),
    ),
  }
  const p = pairProbs(model, m.home.code, m.away.code, venues[m.venueId]?.country)
  const e = probs[m.id]
  return Math.max(Math.abs(p.h * 100 - e.h), Math.abs(p.d * 100 - e.d), Math.abs(p.a * 100 - e.a))
}

// Tier 2: over the opening days the pipeline had no lag to accumulate yet. A mistake
// in the host swap, the penalty scoreline or the curve truncation surfaces here.
test('opening-days matches match the frozen probs.json values closely', () => {
  const early = played
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.status === 'finished' && probs[m.id] && m.date < '2026-06-14')
  expect(early.length).toBeGreaterThanOrEqual(5)
  for (const { m, i } of early) {
    expect(`#${m.n} ${deviation(i, m) < 0.5}`).toBe(`#${m.n} true`)
  }
})

// Tier 3 catches errors of magnitude only. The upstream martj42 dataset ingests World
// Cup results days late, so probs.json froze against lagged ratings while this
// reconstruction assumes everything before the cutoff counted. The gap therefore
// widens as the tournament goes on: under 1.0pp through 06-24, up to 6.7pp after
// 06-25. That is a data-source property, not a reconstruction error.
test('no error of magnitude across the tournament', () => {
  const all = played
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.status === 'finished' && probs[m.id])
  expect(all.length).toBeGreaterThan(90)
  const worst = all
    .map(({ m, i }) => ({ n: m.n, dev: deviation(i, m) }))
    .sort((a, b) => b.dev - a.dev)[0]
  console.log(`compared ${all.length} matches, worst deviation ${worst.dev.toFixed(2)}pp @ #${worst.n}`)
  expect(worst.dev).toBeLessThan(8)
})
