import { expect, test } from 'bun:test'
import fs from 'node:fs'
import { buildHistory, playedInOrder } from '../scripts/simhistory.mjs'
import { cutAt, modelAt } from '../src/sim/history'
import type { SimHistory } from '../src/sim/history'

const history: SimHistory = JSON.parse(fs.readFileSync('public/data/sim-model-history.json', 'utf8'))
const matches = JSON.parse(fs.readFileSync('public/data/matches.json', 'utf8')).matches
const venues = JSON.parse(fs.readFileSync('public/data/venues.json', 'utf8')).venues
const csv = fs.readFileSync('scripts/cache/intl-results.csv', 'utf8')
const simModel = JSON.parse(fs.readFileSync('public/data/sim-model.json', 'utf8'))
const f = Object.fromEntries(Object.entries(simModel.teams).map(([c, v]) => [c, v.f]))
const played = playedInOrder(matches)

test('-Infinity lands on the pre-tournament baseline', () => {
  const m = modelAt(history, Number.NEGATIVE_INFINITY)
  expect(m.teams.ARG.r).toBe(history.cuts[0].teams.ARG)
  expect(m.teams.ESP.r).toBe(history.cuts[0].teams.ESP)
})

test('+Infinity lands on the last cut', () => {
  const m = modelAt(history, Number.POSITIVE_INFINITY)
  const last = history.cuts[history.cuts.length - 1]
  expect(m.teams.ARG.r).toBe(last.teams.ARG)
})

test('the cut boundary is strictly-earlier', () => {
  const kickoff = Date.parse(history.cuts[5].after as string) // match 5's kickoff
  // at match 5's kickoff, match 5 itself has not been counted yet
  expect(cutAt(history, kickoff).n).toBe(4)
  // one millisecond later it has
  expect(cutAt(history, kickoff + 1).n).toBe(5)
})

test('FIFA points are identical across every cut', () => {
  const a = modelAt(history, Number.NEGATIVE_INFINITY)
  const b = modelAt(history, Number.POSITIVE_INFINITY)
  expect(a.teams.ARG.f).toBe(b.teams.ARG.f)
})

test('the opener kickoff is equivalent to the baseline', () => {
  const opener = matches
    .filter((m) => m.home?.code)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))[0]
  const m = modelAt(history, Date.parse(opener.date))
  expect(m.teams.ARG.r).toBe(history.cuts[0].teams.ARG)
})

// the central invariant: the shipped lookup over the precomputed history must agree
// with an independently truncated replay, built from scratch over just the matches
// that kicked off before the cutoff. Two values of N, not twenty: each buildHistory
// call below runs one replay() per cut.
// Explicit timeout: each buildHistory call runs one replay() per cut, so this test
// costs seconds and sits well past bun's 5s default once the machine is busy.
test('from match N equals Now run just before N kicked off', () => {
  // 5 is cheap; 50 sits inside the simultaneous final-group block, where several
  // matches share a kickoff and the lookup has to land before all of them
  for (const n of [5, 50]) {
    const target = matches.find((m: { n: number }) => m.n === n)
    const cutoffMs = Date.parse(target.date)
    const k = played.filter((m: { date: string }) => Date.parse(m.date) < cutoffMs).length
    const viaLookup = modelAt(history, cutoffMs)
    const viaTruncated = buildHistory(csv, played.slice(0, k), venues, f).cuts[k]
    expect(viaLookup.curve).toEqual(viaTruncated.curve)
    const lookupRatings = Object.fromEntries(Object.entries(viaLookup.teams).map(([c, t]) => [c, t.r]))
    expect(lookupRatings).toEqual(viaTruncated.teams)
  }
}, 60_000)

test('matches folded into the snapshot == matches keepReal keeps', () => {
  for (const n of [20, 50, 80]) {
    const target = matches.find((m: { n: number }) => m.n === n)
    const cutoffMs = Date.parse(target.date)
    // mirrors the engine's real-match predicate: keepReal AND actually finished
    const kept = matches.filter(
      (m: { date: string; status: string; home?: { score?: number }; away?: { score?: number } }) =>
        Date.parse(m.date) < cutoffMs &&
        m.status === 'finished' &&
        m.home?.score != null &&
        m.away?.score != null,
    ).length
    expect(cutAt(history, cutoffMs).n).toBe(kept)
  }
})
