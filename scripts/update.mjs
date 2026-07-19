#!/usr/bin/env node
/**
 * FIFA World Cup 2026 data updater.
 *
 * Sources (all free, no API key required):
 *  - FIFA public API (api.fifa.com)  : matches, officials, localized names (en/fr/zh/ar),
 *                                      live lineups & goals
 *  - Wikipedia                       : official 26-player squads
 *  - Open-Meteo                      : weather forecasts + base-camp geocoding
 *
 * The FIFA world ranking is NOT fetched here: it is frozen to the official 2026-06-11
 * release in scripts/curated/fifa-ranking.json (fetch once, see that file's _meta).
 *
 * Usage:
 *   bun run update            refresh everything: matches, standings, squads,
 *                             lineups, stats, weather
 *
 * Output: public/data/*.json (consumed by the app at runtime)
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { blend, CONFED_LISTS, intify, rawProbs, replay, RESULTS_URL } from './elo.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'data')
const CURATED = path.join(ROOT, 'scripts', 'curated')
const CACHE = path.join(ROOT, 'scripts', 'cache')

const FIFA = 'https://api.fifa.com/api/v3'
const ID_COMPETITION = '17'
const ID_SEASON = '285023' // FIFA World Cup 2026
// shape of a lineups.json entry. Finished matches latch out of refetching, so bump
// this whenever a new field must be backfilled from the live feed (v2: booking.official,
// v3: side.assists)
const LINEUP_V = 3
// languages whose team names we synthesize from CLDR region names (FIFA doesn't serve them)
const CLDR_LANGS = ['nl', 'sv', 'no', 'cs', 'hr', 'tr', 'uz', 'fa', 'uk']
const REGION_DN = Object.fromEntries(
  CLDR_LANGS.map((l) => [l, new Intl.DisplayNames([l === 'no' ? 'nb' : l], { type: 'region' })]),
)

/**
 * Who a booking belongs to. FIFA sends no IdPlayer for cards shown to a coach or
 * another team official; those carry IdCoach/IdStaff instead, which `mapTeam`
 * keeps as `official`. Both count towards the team conduct score, so they need
 * distinct keys: grouping on `b.player` alone merges every official of a team
 * into one phantom person (two coaches booked in one match read as a second
 * yellow). Falls back to a per-booking key so an unattributable card still costs
 * its own deduction rather than merging.
 */
const bookedBy = (b, i) =>
  b.player != null ? `p${b.player}` : b.official != null ? `o${b.official}` : `x${i}`

/** fill missing team-name languages with CLDR country names (ENG/SCO/WAL etc. stay en) */
function withCldrNames(name, iso2) {
  if (!iso2 || iso2.includes('-')) return name
  for (const l of CLDR_LANGS) {
    if (name[l]) continue
    try {
      const dn = REGION_DN[l].of(iso2.toUpperCase())
      if (dn && dn !== iso2.toUpperCase()) name[l] = dn
    } catch {
      /* unknown region: keep en fallback */
    }
  }
  return name
}

// FIFA-served locales only; the other UI languages fall back to en names via pick()
const LANGS = ['en', 'fr', 'zh', 'ar', 'es', 'de', 'pt', 'it', 'ja', 'ko', 'id', 'ru']

const SKIP_WEATHER = process.argv.includes('--skip-weather')

const errors = []
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const warn = (...a) => {
  console.warn('WARN', ...a)
  errors.push(a.join(' '))
}

// ---------------------------------------------------------------- helpers

async function fetchJson(url, { retries = 3, timeoutMs = 25000 } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), timeoutMs)
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'wc2026-app/1.0 (personal project)' },
      })
      clearTimeout(t)
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`)
        err.status = res.status
        // 4xx (except 429) is deterministic, not transient — retrying just burns time
        if (res.status >= 400 && res.status < 500 && res.status !== 429) err.noRetry = true
        throw err
      }
      const text = await res.text()
      if (!text || text.startsWith('<')) throw new Error('non-JSON response')
      return JSON.parse(text)
    } catch (e) {
      if (e.noRetry || i === retries - 1) throw e
      await sleep(1500 * (i + 1))
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function readJsonSafe(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 1)}\n`)
  await fs.rename(tmp, file) // atomic: never leave a half-written file
  log('wrote', path.relative(ROOT, file))
}

const txt = (arr) => (Array.isArray(arr) && arr[0]?.Description) || null

// remote-derived identifiers (match ids, stage ids, team codes) end up in URLs
// and file paths — only accept boring shapes, skip + warn on anything else
const ID_RE = /^[A-Za-z0-9_-]+$/
const safeId = (v) => v != null && ID_RE.test(String(v))

// ---------------------------------------------------------------- matches

const STAGE_KEY = {
  289273: 'group',
  289287: 'r32',
  289288: 'r16',
  289289: 'qf',
  289290: 'sf',
  289291: 'third',
  289292: 'final',
}

// FIFA MatchStatus: 0 finished, 3 live, 4 abandoned, 7 postponed, 12 line-ups, 1 scheduled
const KNOWN_STATUS = new Set([0, 1, 3, 4, 7, 12])
function statusOf(m) {
  const s = m.MatchStatus
  if (s === 0) return 'finished'
  if (s === 3) return 'live'
  if (s === 4 || s === 7) return 'postponed'
  if (!KNOWN_STATUS.has(s)) {
    warn(`unknown MatchStatus ${s} on match ${m.IdMatch}`)
    // a score or running clock on an unknown status almost certainly means live
    if (m.MatchTime || m.Home?.Score != null) return 'live'
  }
  return 'scheduled'
}

const OFFICIAL_ROLE = {
  1: 'referee',
  2: 'ar1',
  3: 'ar2',
  4: 'fourth',
  5: 'var',
  7: 'avar',
  9: 'avar2',
  10: 'avar3',
}

async function fetchMatches() {
  const byLang = {}
  for (const lang of LANGS) {
    try {
      byLang[lang] = (
        await fetchJson(
          `${FIFA}/calendar/matches?idCompetition=${ID_COMPETITION}&idSeason=${ID_SEASON}&count=500&language=${lang}`,
        )
      ).Results
      log(`FIFA matches [${lang}]: ${byLang[lang].length}`)
    } catch (e) {
      if (lang === 'en') throw e // en is the structural source of truth
      warn(`FIFA matches [${lang}]: ${e.message} — falling back to en names`)
      byLang[lang] = []
    }
  }
  // guard: an empty/partial 200 response must never wipe good data (schedule is fixed at 104)
  if (byLang.en.length !== 104) {
    throw new Error(`expected 104 matches from FIFA, got ${byLang.en.length} — aborting without writing`)
  }

  const names = { teams: {}, stadiums: {}, cities: {} }
  const officialL10n = {} // `${idMatch}:${officialId}` -> {name:{lang}, typeName:{lang}}
  for (const lang of LANGS) {
    for (const m of byLang[lang]) {
      for (const side of [m.Home, m.Away]) {
        if (side?.IdCountry) {
          names.teams[side.IdCountry] ??= {}
          names.teams[side.IdCountry][lang] = txt(side.TeamName) || side.ShortClubName
        }
      }
      if (m.Stadium?.IdStadium) {
        names.stadiums[m.Stadium.IdStadium] ??= {}
        names.stadiums[m.Stadium.IdStadium][lang] = txt(m.Stadium.Name)
        names.cities[m.Stadium.IdStadium] ??= {}
        names.cities[m.Stadium.IdStadium][lang] = txt(m.Stadium.CityName)
      }
      for (const o of m.Officials || []) {
        const key = `${m.IdMatch}:${o.OfficialId}`
        officialL10n[key] ??= { name: {}, typeName: {} }
        officialL10n[key].name[lang] = txt(o.NameShort) || txt(o.Name)
        officialL10n[key].typeName[lang] = txt(o.TypeLocalized)
      }
    }
  }

  const en = byLang.en.slice().sort((a, b) => (a.MatchNumber ?? 999) - (b.MatchNumber ?? 999))
  const statuses = new Set()
  const matches = en.map((m) => {
    statuses.add(m.MatchStatus)
    // FIFA reports 0 (not null) penalty scores on regulation results — only a real
    // shootout (ResultType 2, or any kick scored mid-shootout) should surface pens
    const hadPens = m.ResultType === 2 || (m.HomeTeamPenaltyScore ?? 0) + (m.AwayTeamPenaltyScore ?? 0) > 0
    const side = (s) =>
      s?.IdCountry
        ? {
            code: s.IdCountry,
            score: s.Score ?? null,
            pen: hadPens ? (s === m.Home ? m.HomeTeamPenaltyScore : m.AwayTeamPenaltyScore) : null,
          }
        : null
    // FIFA's Winner field is the numeric IdTeam — normalize to the country code the app uses
    const winner = m.Winner
      ? m.Winner === m.Home?.IdTeam
        ? m.Home.IdCountry
        : m.Winner === m.Away?.IdTeam
          ? m.Away.IdCountry
          : null
      : null
    return {
      id: m.IdMatch,
      n: m.MatchNumber,
      stage: STAGE_KEY[m.IdStage] || 'group',
      group: m.IdGroup ? (txt(m.GroupName) || '').replace('Group ', '') : null,
      date: m.Date,
      venueId: m.Stadium?.IdStadium || null,
      status: statusOf(m),
      time: m.MatchTime || null,
      home: side(m.Home),
      away: side(m.Away),
      phA: m.PlaceHolderA || null,
      phB: m.PlaceHolderB || null,
      winner,
      attendance: m.Attendance != null && m.Attendance !== '' ? Number(m.Attendance) || null : null,
      officials: (m.Officials || []).map((o) => {
        const l10n = officialL10n[`${m.IdMatch}:${o.OfficialId}`] || { name: {}, typeName: {} }
        return {
          id: o.OfficialId,
          country: o.IdCountry || null,
          role: OFFICIAL_ROLE[o.OfficialType] || `type${o.OfficialType}`,
          name: l10n.name,
          typeName: l10n.typeName,
        }
      }),
    }
  })
  log('match statuses seen:', [...statuses].join(','))
  return { matches, names, raw: en }
}

// ---------------------------------------------------------------- standings

function computeStandings(matches, teams, lineups = {}) {
  const groups = {}
  for (const [code, t] of Object.entries(teams)) {
    if (!t.group) continue
    groups[t.group] ??= {}
    groups[t.group][code] = { code, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }
  }
  const groupMatches = matches.filter((m) => m.stage === 'group')
  const h2h = {} // 'A:MEX' -> finished group matches involving MEX
  for (const m of groupMatches) {
    if (m.status !== 'finished' || !m.home || !m.away) continue
    const g = m.group
    const H = groups[g]?.[m.home.code]
    const A = groups[g]?.[m.away.code]
    if (!H || !A) continue
    H.p++
    A.p++
    H.gf += m.home.score
    H.ga += m.away.score
    A.gf += m.away.score
    A.ga += m.home.score
    if (m.home.score > m.away.score) {
      H.w++
      A.l++
      H.pts += 3
    } else if (m.home.score < m.away.score) {
      A.w++
      H.l++
      A.pts += 3
    } else {
      H.d++
      A.d++
      H.pts++
      A.pts++
    }
    h2h[`${g}:${m.home.code}`] ??= []
    h2h[`${g}:${m.home.code}`].push(m)
    h2h[`${g}:${m.away.code}`] ??= []
    h2h[`${g}:${m.away.code}`].push(m)
  }
  for (const g of Object.values(groups)) {
    for (const r of Object.values(g)) r.gd = r.gf - r.ga
  }

  // fair-play score (criterion f): "team conduct score (players and team officials)",
  // one deduction per player or official per group match, worst card only.
  // Y -1, second yellow / yellow+red -3, direct red -4. The FIFA feed only codes
  // card 1 (yellow) and 2 (sending-off); a red preceded by a yellow is read as a
  // second yellow (the rarer yellow+direct-red -5 case can't be told apart from
  // this data and collapses here).
  const fairPlay = {}
  for (const [code, t] of Object.entries(teams)) if (t.group) fairPlay[code] = 0
  for (const m of groupMatches) {
    if (m.status !== 'finished' || !m.home || !m.away) continue
    const lu = lineups[m.id]
    if (!lu) continue
    for (const [side, code] of [
      ['home', m.home.code],
      ['away', m.away.code],
    ]) {
      const tl = lu[side]
      if (!tl || fairPlay[code] === undefined) continue
      const byPerson = {}
      ;(tl.bookings || []).forEach((b, i) => {
        const key = bookedBy(b, i)
        byPerson[key] = byPerson[key] ?? []
        byPerson[key].push(b)
      })
      for (const cards of Object.values(byPerson)) {
        const reds = cards.filter((b) => (b.card ?? 0) >= 2).length
        const yellows = cards.filter((b) => b.card === 1).length
        if (reds > 0) fairPlay[code] += yellows >= 1 ? -3 : -4
        else if (yellows >= 2) fairPlay[code] += -3
        else if (yellows === 1) fairPlay[code] += -1
      }
    }
  }
  // FIFA position used by criterion g (lower is better); null sinks to last
  const fifaRank = (code) => teams[code]?.ranking ?? Number.POSITIVE_INFINITY
  const fifaRankPrev = (code) => teams[code]?.rankingPrev ?? Number.POSITIVE_INFINITY

  // FIFA tiebreakers in order: points, then head-to-head among the tied teams
  // (a pts, b GD, c GF) reapplied recursively to any still-level subset; then
  // d overall GD, e overall GF, f fair play, g/h FIFA ranking, then lots.

  /** mini-table (pts/gd/gf) over the matches played strictly among tiedCodes */
  function buildMini(g, tiedCodes) {
    const mini = {}
    for (const c of tiedCodes) mini[c] = { pts: 0, gd: 0, gf: 0 }
    // union of all tied teams' matches (the first team's list alone misses e.g. B-vs-C in a 3-way tie)
    const seen = new Set()
    for (const c of tiedCodes) {
      for (const m of h2h[`${g}:${c}`] || []) {
        if (seen.has(m.id)) continue
        seen.add(m.id)
        if (!tiedCodes.has(m.home.code) || !tiedCodes.has(m.away.code)) continue
        const H = mini[m.home.code],
          A = mini[m.away.code]
        H.gd += m.home.score - m.away.score
        A.gd += m.away.score - m.home.score
        H.gf += m.home.score
        A.gf += m.away.score
        if (m.home.score > m.away.score) H.pts += 3
        else if (m.home.score < m.away.score) A.pts += 3
        else {
          H.pts++
          A.pts++
        }
      }
    }
    return mini
  }

  // criteria d-h for a set head-to-head can't separate: overall GD, overall GF,
  // fair play, most recent then older FIFA ranking, then lots (alphabetical)
  function breakRemaining(rows) {
    return rows
      .slice()
      .sort(
        (a, b) =>
          b.gd - a.gd ||
          b.gf - a.gf ||
          (fairPlay[b.code] ?? 0) - (fairPlay[a.code] ?? 0) ||
          fifaRank(a.code) - fifaRank(b.code) ||
          fifaRankPrev(a.code) - fifaRankPrev(b.code) ||
          a.code.localeCompare(b.code),
      )
  }

  /**
   * Order a set of teams level on points by head-to-head (a pts, b GD, c GF).
   * A subset still level after that but smaller than the input gets a-c
   * reapplied to just that subset (recursively, recomputing the mini-table). A
   * subset head-to-head cannot separate falls through to criteria d-h.
   */
  function resolveTie(g, rows) {
    if (rows.length < 2) return rows.slice()
    const mini = buildMini(g, new Set(rows.map((r) => r.code)))
    const sub = rows
      .slice()
      .sort(
        (a, b) =>
          mini[b.code].pts - mini[a.code].pts ||
          mini[b.code].gd - mini[a.code].gd ||
          mini[b.code].gf - mini[a.code].gf ||
          0,
      )
    const miniKey = (r) => `${mini[r.code].pts}|${mini[r.code].gd}|${mini[r.code].gf}`
    const out = []
    for (let i = 0; i < sub.length; ) {
      let j = i + 1
      while (j < sub.length && miniKey(sub[j]) === miniKey(sub[i])) j++
      const run = sub.slice(i, j)
      if (run.length === 1) out.push(run[0])
      else if (run.length < rows.length)
        out.push(...resolveTie(g, run)) // h2h made progress
      else out.push(...breakRemaining(run)) // h2h can't separate -> d-h
      i = j
    }
    return out
  }

  function rankGroup(g, rows) {
    // primary: points; every set level on points goes through the FIFA procedure
    const sorted = rows.slice().sort((a, b) => b.pts - a.pts)
    for (let i = 0; i < sorted.length; ) {
      let j = i + 1
      while (j < sorted.length && sorted[j].pts === sorted[i].pts) j++
      if (j - i > 1) sorted.splice(i, j - i, ...resolveTie(g, sorted.slice(i, j)))
      i = j
    }
    return sorted.map((r, idx) => ({ ...r, rank: idx + 1 }))
  }

  const out = {}
  const complete = {}
  for (const [g, rows] of Object.entries(groups)) {
    out[g] = rankGroup(g, Object.values(rows))
    complete[g] = out[g].every((r) => r.p === 3)
  }

  // remaining (unplayed) group matches, by group, as [home, away] code pairs
  const remaining = {}
  for (const m of groupMatches) {
    if (m.status === 'finished' || !m.home || !m.away) continue
    remaining[m.group] ??= []
    remaining[m.group].push([m.home.code, m.away.code])
  }
  // Per group, enumerate every remaining win/draw/loss combination (points need
  // no scores, so this is exact; <= 6 matches remain, i.e. <= 3^6 combinations).
  // Record the 3rd-place point total's range and, per team, the worst-case
  // number of group rivals finishing on >= its points.
  const outlook = (g) => {
    const teams = Object.values(groups[g])
    const cur = Object.fromEntries(teams.map((t) => [t.code, t.pts]))
    const rem = remaining[g] || []
    let thirdMin = Number.POSITIVE_INFINITY
    let thirdMax = Number.NEGATIVE_INFINITY
    const worstAhead = Object.fromEntries(teams.map((t) => [t.code, 0]))
    for (let mask = 0, n = 3 ** rem.length; mask < n; mask++) {
      const pts = { ...cur }
      let x = mask
      for (const [h, a] of rem) {
        const o = x % 3
        x = Math.floor(x / 3)
        if (o === 0) pts[h] += 3
        else if (o === 1) pts[a] += 3
        else {
          pts[h] += 1
          pts[a] += 1
        }
      }
      const sorted = Object.values(pts).sort((p, q) => q - p)
      thirdMin = Math.min(thirdMin, sorted[2])
      thirdMax = Math.max(thirdMax, sorted[2])
      for (const t of teams) {
        let cnt = 0
        for (const u of teams) if (u.code !== t.code && pts[u.code] >= pts[t.code]) cnt++
        if (cnt > worstAhead[t.code]) worstAhead[t.code] = cnt
      }
    }
    return { thirdMin, thirdMax, worstAhead }
  }
  const groupOutlook = Object.fromEntries(Object.keys(out).map((g) => [g, outlook(g)]))
  const ptsRange = Object.fromEntries(
    Object.entries(groupOutlook).map(([g, o]) => [g, { min: o.thirdMin, max: o.thirdMax }]),
  )
  // most points the 3rd-placed team of a group can still reach (fixed if done)
  const maxThirdPts = (g) => (complete[g] ? out[g][2].pts : groupOutlook[g].thirdMax)

  // Flag teams in a still-running group that have already CLINCHED a knockout
  // place. Safe if it has locked top-2 (worst case <= 1 rival on >= its points),
  // or it can never drop below 3rd (worst case <= 2) and even its floor-points
  // 3rd place is a guaranteed top-8 third — i.e. at most 7 other groups' thirds
  // can still reach those points. Sound by construction: never a false green.
  for (const g of Object.keys(out)) {
    if (complete[g]) continue
    for (const r of out[g]) {
      const wa = groupOutlook[g].worstAhead[r.code]
      if (wa <= 1) r.clinched = true
      else if (wa <= 2) {
        const rivals = Object.keys(out).filter((x) => x !== g && maxThirdPts(x) >= r.pts).length
        if (rivals <= 7) r.clinched = true
      }
    }
  }

  // best third-placed: top 8 of 12 advance. Criteria: pts, GD, GF, fair play,
  // most recent then older FIFA ranking, then lots (no head-to-head: the third-
  // placed teams come from different groups)
  const thirdCmp = (a, b) =>
    b.pts - a.pts ||
    b.gd - a.gd ||
    b.gf - a.gf ||
    (fairPlay[b.code] ?? 0) - (fairPlay[a.code] ?? 0) ||
    fifaRank(a.code) - fifaRank(b.code) ||
    fifaRankPrev(a.code) - fifaRankPrev(b.code) ||
    a.group.localeCompare(b.group)

  const thirdRows = Object.entries(out).map(([g, rows]) => ({ group: g, ...rows[2] }))
  const allComplete = Object.values(complete).every(Boolean)
  const thirds = thirdRows
    .slice()
    .sort(thirdCmp)
    .map((r, i) => {
      // Colour a third only once its fate is settled. Even before the whole
      // group stage ends, the decided cases are caught: count how many other
      // thirds COULD (aboveMax) and MUST (aboveMin) finish ahead of r. r is in
      // if at most 7 can ever pass it, out if at least 8 already must. Sound by
      // construction — never a wrong green/red, it just falls back to undecided
      // (null). A third from a group still in progress can change team or
      // record, so it stays undecided.
      let qualifies = null
      if (allComplete) {
        qualifies = i < 8
      } else if (complete[r.group]) {
        let aboveMax = 0
        let aboveMin = 0
        for (const o of thirdRows) {
          if (o.group === r.group) continue
          if (complete[o.group]) {
            if (thirdCmp(o, r) < 0) {
              aboveMax++
              aboveMin++
            }
          } else {
            if (ptsRange[o.group].max >= r.pts) aboveMax++ // could pass on points, then GD via goals
            if (ptsRange[o.group].min > r.pts) aboveMin++ // always ahead on points alone
          }
        }
        qualifies = aboveMax <= 7 ? true : aboveMin >= 8 ? false : null
      }
      return { ...r, thirdRank: i + 1, qualifies }
    })

  return { groups: out, thirds, complete }
}

// ---------------------------------------------------------------- squads (Wikipedia)

// ---------------------------------------------------------------- squads (Wikipedia official FIFA lists)

const WIKI_TEAM_CODE = {
  'Czech Republic': 'CZE',
  Mexico: 'MEX',
  'South Africa': 'RSA',
  'South Korea': 'KOR',
  'Bosnia and Herzegovina': 'BIH',
  Canada: 'CAN',
  Qatar: 'QAT',
  Switzerland: 'SUI',
  Brazil: 'BRA',
  Haiti: 'HAI',
  Morocco: 'MAR',
  Scotland: 'SCO',
  Australia: 'AUS',
  Paraguay: 'PAR',
  Turkey: 'TUR',
  'United States': 'USA',
  Curaçao: 'CUW',
  Ecuador: 'ECU',
  Germany: 'GER',
  'Ivory Coast': 'CIV',
  Japan: 'JPN',
  Netherlands: 'NED',
  Sweden: 'SWE',
  Tunisia: 'TUN',
  Belgium: 'BEL',
  Egypt: 'EGY',
  Iran: 'IRN',
  'New Zealand': 'NZL',
  'Cape Verde': 'CPV',
  'Saudi Arabia': 'KSA',
  Spain: 'ESP',
  Uruguay: 'URU',
  France: 'FRA',
  Iraq: 'IRQ',
  Norway: 'NOR',
  Senegal: 'SEN',
  Algeria: 'ALG',
  Argentina: 'ARG',
  Austria: 'AUT',
  Jordan: 'JOR',
  Colombia: 'COL',
  'DR Congo': 'COD',
  Portugal: 'POR',
  Uzbekistan: 'UZB',
  Croatia: 'CRO',
  England: 'ENG',
  Ghana: 'GHA',
  Panama: 'PAN',
  // enwiki rename aliases (article titles churn)
  Türkiye: 'TUR',
  Czechia: 'CZE',
  "Côte d'Ivoire": 'CIV',
  'Cabo Verde': 'CPV',
  'South Korea (Korea Republic)': 'KOR',
  'Democratic Republic of the Congo': 'COD',
  'Bosnia-Herzegovina': 'BIH',
  'United States of America': 'USA',
}

const stripLinks = (s) =>
  s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[\s\S]*?(?:\/>|<\/ref>)/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .trim()

/** split template params on top-level | (respects {{ }} and [[ ]] nesting) */
function splitParams(body) {
  const out = []
  let depth = 0,
    cur = ''
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2)
    if (two === '{{' || two === '[[') {
      depth++
      cur += two
      i++
      continue
    }
    if (two === '}}' || two === ']]') {
      depth--
      cur += two
      i++
      continue
    }
    if (body[i] === '|' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += body[i]
  }
  out.push(cur)
  return out
}

function parseWikiPlayer(line) {
  const m = /\{\{nat fs g player\s*\|([\s\S]*)\}\}\s*$/i.exec(line.trim())
  if (!m) return null
  const params = {}
  for (const p of splitParams(m[1])) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim()
  }
  if (!params.name) return null
  const captain = /captain|\(c\)/i.test(params.name)
  // the [[Article]] / [[Article|Display]] link target = the player's enwiki page
  const linkM = /\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/.exec(params.name)
  const wiki = linkM
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(linkM[1].trim().replace(/ /g, '_'))}`
    : null
  const name = stripLinks(params.name)
    .replace(/\s*\((captain|c)\)\s*$/i, '')
    .trim()
  let dob = null
  const age = params.age || ''
  // order-independent: named params like df=y may precede the date numbers
  const bd = /birth date and age(2)?\s*\|([^}]*)/i.exec(age)
  if (bd) {
    const nums = bd[2]
      .split('|')
      .map((x) => x.trim())
      .filter((x) => /^\d+$/.test(x))
      .map(Number)
    const [y, mo, d] = bd[1] ? nums.slice(3, 6) : nums.slice(0, 3) // age2 carries the 2026-06-11 anchor first
    if (y && mo && d) dob = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  // the [[Article|Display]] club link target = the club's enwiki page; the
  // display text often differs (e.g. [[SK Slavia Prague|Slavia Prague]]), so
  // build the URL from the target, never the display name
  const clubLinkM = params.club ? /\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/.exec(params.club) : null
  const clubWiki = clubLinkM
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(clubLinkM[1].trim().replace(/ /g, '_'))}`
    : null
  return {
    id: name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z]+/g, '-'),
    no: params.no ? parseInt(params.no, 10) || null : null,
    pos: ['GK', 'DF', 'MF', 'FW'].includes(params.pos) ? params.pos : 'MF',
    name,
    dob,
    caps: params.caps !== undefined && params.caps !== '' ? parseInt(params.caps, 10) || 0 : null,
    goals: params.goals !== undefined && params.goals !== '' ? parseInt(params.goals, 10) || 0 : null,
    club: params.club ? stripLinks(params.club) : null,
    clubNat: params.clubnat || null,
    clubWiki,
    captain,
    wiki,
  }
}

async function fetchWikiSquads() {
  const d = await fetchJson(
    'https://en.wikipedia.org/w/api.php?action=parse&page=2026_FIFA_World_Cup_squads&prop=wikitext&format=json&formatversion=2',
  )
  const w = d.parse.wikitext
  const squads = {}
  // team sections are ===Name=== inside ==Group X== blocks
  const sections = w.split(/^===([^=].*?)===\s*$/m)
  for (let i = 1; i < sections.length; i += 2) {
    const title = stripLinks(sections[i]).trim()
    const code = WIKI_TEAM_CODE[title]
    const body = sections[i + 1] || ''
    if (!code) {
      // a squad-looking section under an unknown title means enwiki renamed an article
      if (/\{\{nat fs g player/i.test(body))
        warn(`wiki squad section "${title}" not in WIKI_TEAM_CODE — team skipped`)
      continue
    }
    const players = []
    for (const line of body.split('\n')) {
      if (/\{\{nat fs g player/i.test(line)) {
        const p = parseWikiPlayer(line)
        if (p) players.push(p)
      }
    }
    if (!players.length) continue
    let coach = null
    let coachWiki = null
    const cm = /^\s*(?:head\s+)?coach\s*:\s*(.+)$/im.exec(body)
    if (cm) {
      coach = stripLinks(cm[1]).trim() || null
      // the [[Article]] link target = the coach's enwiki page (same as players)
      const cl = /\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/.exec(cm[1])
      if (cl)
        coachWiki = `https://en.wikipedia.org/wiki/${encodeURIComponent(cl[1].trim().replace(/ /g, '_'))}`
    }
    // the team's enwiki article, e.g. "South Korea national football team",
    // "United States men's national soccer team" — taken from the section's own links
    const wm = /\[\[([^|\]]*national [^|\]]*?team)(?:\|[^\]]*)?\]\]/i.exec(body)
    const wikiTitle = wm ? wm[1].trim() : `${title} national football team`
    const wiki = {
      title: wikiTitle,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, '_'))}`,
    }
    const order = { GK: 0, DF: 1, MF: 2, FW: 3 }
    players.sort((a, b) => order[a.pos] - order[b.pos] || (a.no ?? 99) - (b.no ?? 99))
    squads[code] = { coach, coachWiki, wiki, players }
  }
  if (Object.keys(squads).length < 48) warn(`wiki squads: only ${Object.keys(squads).length}/48 teams parsed`)
  return squads
}

// ---------------------------------------------------------------- lineups + stats (FIFA live)

function parseLivePlayers(team) {
  if (!team?.Players) return null
  const players = team.Players.map((p) => ({
    id: p.IdPlayer,
    name: txt(p.ShortName) || txt(p.PlayerName),
    number: p.ShirtNumber ?? null,
    captain: !!p.Captain,
    gk: p.Position === 0,
    start: p.Status === 1,
    fieldPos: p.Position ?? null,
    x: p.LineupX ?? p.PositionX ?? null, // FIFA v3 live uses LineupX/LineupY
    y: p.LineupY ?? p.PositionY ?? null,
  }))
  return {
    tactics: team.Tactics || null,
    xi: players.filter((p) => p.start),
    subs: players.filter((p) => !p.start),
    goals: (team.Goals || []).map((g) => ({
      player: g.IdPlayer,
      minute: g.Minute,
      type: g.Type,
      period: g.Period ?? null,
    })),
    bookings: (team.Bookings || []).map((b) => {
      // a card shown to a coach or other team official has no IdPlayer
      const official = b.IdCoach ?? b.IdStaff ?? null
      return {
        player: b.IdPlayer,
        ...(official ? { official } : {}),
        minute: b.Minute,
        card: b.Card,
        period: b.Period ?? null,
      }
    }),
    substitutions: (team.Substitutions || []).map((sub) => ({
      off: sub.IdPlayerOff,
      on: sub.IdPlayerOn,
      minute: sub.Minute,
      period: sub.Period ?? null,
    })),
  }
}

// The FIFA timeline, which carries two things the live feed doesn't. Returns
// { home: [sec…], away: [sec…], assists: { [idTeam]: [{ player, minute, period }] } }.
//
// secs: precise goal times (the live feed is minute-only), in scoring order, each the
// elapsed seconds within the goal's period (goal Timestamp minus that period's "Start
// Time" Timestamp). Detects goals by score increments, so it matches open play,
// penalties and own goals alike and ignores shootout kicks (which don't move
// Home/AwayGoals).
//
// assists: timeline Type 1 events, keyed by the scoring side's IdTeam. NOTE the polarity
// is inverted from goal events (Type 0): here IdPlayer is the ASSISTER and IdSubPlayer
// the scorer. Never derive assists from a goal's IdSubPlayer instead — on shootout kicks
// that field holds the goalkeeper. FIFA emits no Type 1 for own goals or penalties, so
// the rows need no filtering.
async function fetchTimeline(stageId, matchId) {
  const d = await fetchJson(
    `${FIFA}/timelines/${ID_COMPETITION}/${ID_SEASON}/${stageId}/${matchId}?language=en`,
  )
  const events = (d?.Event ?? d?.Events ?? []).filter((e) => e?.Timestamp)
  if (!events.length) return null
  events.sort((a, b) => Date.parse(a.Timestamp) - Date.parse(b.Timestamp))
  const periodStart = {}
  for (const e of events)
    if (e.Type === 7 && e.Period != null) periodStart[e.Period] ??= Date.parse(e.Timestamp)
  const out = { home: [], away: [], assists: {} }
  let ph = 0
  let pa = 0
  for (const e of events) {
    if (e.Type === 1 && e.IdPlayer != null && e.IdTeam != null) {
      out.assists[e.IdTeam] ??= []
      out.assists[e.IdTeam].push({
        player: e.IdPlayer,
        minute: e.MatchMinute ?? null,
        period: e.Period ?? null,
      })
    }
    const start = periodStart[e.Period]
    const sec = start ? Math.max(0, Math.round((Date.parse(e.Timestamp) - start) / 1000)) : null
    const hg = Number(e.HomeGoals ?? 0)
    const ag = Number(e.AwayGoals ?? 0)
    if (hg > ph) {
      out.home.push(sec)
      ph = hg
    }
    if (ag > pa) {
      out.away.push(sec)
      pa = ag
    }
  }
  return out
}

/**
 * Merge a refetched side into a `final` (frozen) one. A finished match is only
 * refetched to backfill fields captured since it was written (goal seconds,
 * booking officials; see LINEUP_V), and FIFA does degrade old records now and
 * then (a 9th-minute goal came back as 0'), so the merge only ever adds: it
 * keeps the frozen goals and takes the fresher bookings, never the reverse.
 */
function mergeFinalSide(prev, next) {
  if (!prev) return next ?? null
  if (!next) return prev
  const pg = prev.goals || []
  const ng = next.goals || []
  const goals =
    ng.length > pg.length
      ? ng
      : ng.length < pg.length
        ? pg
        : pg.map((g, i) => (g.sec == null && ng[i].sec != null ? { ...g, sec: ng[i].sec } : g))
  const pb = prev.bookings || []
  const nb = next.bookings || []
  const pa = prev.assists || []
  const na = next.assists || []
  return {
    ...prev,
    goals,
    bookings: nb.length >= pb.length ? nb : pb,
    assists: na.length >= pa.length ? na : pa,
  }
}

async function fetchLiveDetails(matches, rawById) {
  const lineups = (await readJsonSafe(path.join(OUT, 'lineups.json'))) || {}
  const hasGoals = (lu) => ['home', 'away'].some((s) => (lu?.[s]?.goals || []).length > 0)
  const targets = matches.filter((m) => {
    const lu = lineups[m.id]
    return (
      m.status === 'live' ||
      // finished matches latch via `final`; re-fetch once more to backfill goal
      // seconds (secTried) on entries written before timelines were captured, or
      // any field added since the entry was written (LINEUP_V)
      (m.status === 'finished' &&
        (!lu?.final || (lu.v ?? 1) < LINEUP_V || (!lu?.secTried && hasGoals(lu)))) ||
      (m.status === 'scheduled' && Math.abs(Date.parse(m.date) - Date.now()) < 3 * 3600e3)
    )
  })
  log(`live/lineup targets: ${targets.length}`)
  for (const m of targets) {
    try {
      const raw = rawById[m.id]
      if (!safeId(m.id) || !safeId(raw?.IdStage)) {
        warn(`live ${m.id}: id/stage fails identifier check — skipped`)
        continue
      }
      const d = await fetchJson(
        `${FIFA}/live/football/${ID_COMPETITION}/${ID_SEASON}/${raw.IdStage}/${m.id}?language=en`,
      )
      // FIFA v3 live nests teams under HomeTeam/AwayTeam (calendar uses Home/Away)
      const homeRaw = d?.HomeTeam ?? d?.Home
      const awayRaw = d?.AwayTeam ?? d?.Away
      if (!homeRaw && !awayRaw) {
        if (m.status !== 'scheduled') warn(`live ${m.id}: no team data in response`)
        continue
      }
      const home = parseLivePlayers(homeRaw)
      const away = parseLivePlayers(awayRaw)
      if (!home && !away) continue
      // attach exact goal seconds from the timeline (index-aligned per side; both
      // the live Goals and the timeline list goals in scoring order), plus that
      // side's assists (the timeline keys them by IdTeam, the live feed by side)
      if (safeId(raw.IdStage)) {
        try {
          const tlData = await fetchTimeline(raw.IdStage, m.id)
          if (tlData)
            for (const [side, obj, teamRaw] of [
              ['home', home, homeRaw],
              ['away', away, awayRaw],
            ]) {
              const g = obj?.goals
              const tl = tlData[side]
              if (g && tl && g.length === tl.length) {
                for (let i = 0; i < g.length; i++) if (tl[i] != null) g[i].sec = tl[i]
              } else if (g?.length) warn(`timeline ${m.id} ${side}: ${g.length} goals vs ${tl?.length ?? 0}`)
              if (obj && teamRaw?.IdTeam != null) obj.assists = tlData.assists[teamRaw.IdTeam] ?? []
            }
        } catch (e) {
          if (e.status !== 404) warn(`timeline ${m.id}: ${e.message}`)
        }
      }
      // merge per-side over the previous entry so a degraded one-sided response
      // never erases the other side; `final` latches the entry out of future
      // refetches, so only set it when finished AND both sides parsed this run.
      // secTried latches the one-time goal-seconds backfill (see targets above)
      const prev = lineups[m.id]
      const merge = prev?.final ? mergeFinalSide : (p, n) => n ?? p ?? null
      lineups[m.id] = {
        home: merge(prev?.home, home),
        away: merge(prev?.away, away),
        matchTime: d.MatchTime || null,
        period: d.Period ?? null,
        final: m.status === 'finished' && !!home && !!away,
        secTried: true,
        v: LINEUP_V,
      }
      await sleep(400)
    } catch (e) {
      // pre-match the live resource simply doesn't exist yet — 404 is routine
      if (e.status === 404) log(`live ${m.id}: not available yet (404)`)
      else warn(`live ${m.id}: ${e.message}`)
    }
  }
  return lineups
}

// FIFA v3 goal Type semantics (verified against 2022 data): 1 = in-game penalty,
// 2 = open play, 3 = own goal. Own goals sit in the BENEFITING team's Goals array
// with the opponent player's id. Period 11 entries are shootout kicks, not goals.
// FIFA discipline: 2 accumulated yellows (different matches) ban the next
// match; singles are wiped after the quarter-finals (so accumulation can
// never ban a semi or later). Any red (straight or second yellow) bans at
// least the next match. Only not-yet-played bans are listed.
function computeSuspensions(lineups, matches) {
  const byId = Object.fromEntries(matches.map((m) => [m.id, m]))
  const ACCUM_BANNABLE = new Set(['group', 'r32', 'r16', 'qf'])
  const events = {} // code -> player -> { name, list: [{matchId, date, red, yellow}] }
  for (const [matchId, lu] of Object.entries(lineups)) {
    const m = byId[matchId]
    if (!m) continue
    for (const side of ['home', 'away']) {
      const team = lu[side]
      const code = m[side]?.code
      if (!team || !code) continue
      const nameOf = (pid) =>
        (team.xi || []).concat(team.subs || []).find((p) => p.id === pid)?.name || `#${pid}`
      for (const b of team.bookings || []) {
        if (b.player == null) continue // a coach/team-official card bans no player
        events[code] ??= {}
        events[code][b.player] ??= { name: nameOf(b.player), list: [] }
        events[code][b.player].list.push({
          matchId,
          date: m.date,
          red: (b.card ?? 0) >= 2,
          yellow: (b.card ?? 0) === 1,
        })
      }
    }
  }
  const out = {}
  for (const [code, players] of Object.entries(events)) {
    const teamMatches = matches
      .filter((m) => m.home?.code === code || m.away?.code === code)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    const nextAfter = (date) => teamMatches.find((m) => Date.parse(m.date) > Date.parse(date))
    for (const [pid, rec] of Object.entries(players)) {
      rec.list.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
      const bans = []
      let pendingYellows = []
      for (const ev of rec.list) {
        if (ev.red) {
          const nm = nextAfter(ev.date)
          bans.push({ type: 'red', due: [ev.matchId], banned: nm?.id ?? null })
        } else if (ev.yellow) {
          pendingYellows.push(ev)
          if (pendingYellows.length === 2) {
            const nm = nextAfter(ev.date)
            if (nm && ACCUM_BANNABLE.has(nm.stage))
              bans.push({ type: 'yellows', due: pendingYellows.map((e) => e.matchId), banned: nm.id })
            pendingYellows = []
          }
        }
      }
      const open = bans.filter((b) => b.banned && byId[b.banned]?.status !== 'finished')
      if (open.length) {
        out[code] ??= []
        out[code].push({ id: pid, name: rec.name, bans: open })
      }
    }
  }
  return out
}

// per-player tournament tallies (apps + goals + cards) taken from match lineups
// and written onto each squad player. Wikipedia squad names never match the FIFA
// lineup names, but the shirt number does, so (team, number) is the join key.
function attachWcStats(squads, lineups, matches) {
  const byId = Object.fromEntries(matches.map((m) => [m.id, m]))
  const byTeam = {} // code -> { [shirtNo]: { apps, goals, yellow, red } }
  const cell = (code, no) => {
    byTeam[code] ??= {}
    byTeam[code][no] ??= { apps: 0, goals: 0, yellow: 0, red: 0 }
    return byTeam[code][no]
  }
  for (const [mid, lu] of Object.entries(lineups)) {
    const m = byId[mid]
    if (!m) continue
    for (const side of ['home', 'away']) {
      const tl = lu[side]
      const code = m[side]?.code
      if (!tl || !code) continue
      const idToNo = {}
      for (const p of [...(tl.xi || []), ...(tl.subs || [])]) if (p.number != null) idToNo[p.id] = p.number
      // appearances: starters + substitutes who came on
      const appeared = new Set()
      for (const p of tl.xi || []) if (p.number != null) appeared.add(p.number)
      for (const sub of tl.substitutions || []) {
        const no = idToNo[sub.on]
        if (no != null) appeared.add(no)
      }
      for (const no of appeared) cell(code, no).apps++
      // goals: open play + penalties, excluding own goals (type 3) and shootout
      for (const g of tl.goals || []) {
        if (g.type === 3 || g.period === 11) continue
        const no = idToNo[g.player]
        if (no != null) cell(code, no).goals++
      }
      // cards: booking card 1 = yellow, >=2 = red (incl. second yellow)
      for (const b of tl.bookings || []) {
        const no = idToNo[b.player]
        if (no == null) continue
        if ((b.card ?? 0) >= 2) cell(code, no).red++
        else cell(code, no).yellow++
      }
    }
  }
  for (const [code, sq] of Object.entries(squads)) {
    const tally = byTeam[code] || {}
    for (const p of sq.players || []) {
      const s = p.no != null ? tally[p.no] : null
      p.wcApps = s?.apps ?? 0
      p.wcGoals = s?.goals ?? 0
      p.wcYellow = s?.yellow ?? 0
      p.wcRed = s?.red ?? 0
    }
  }
}

// FIFA event Period codes. The three break periods carry an EMPTY minute string, so
// they need the explicit fallback below: 4 is half time, 8 the extra-time half time,
// and 17 the break BEFORE extra time (FIFA's own match report labels a substitution
// there "PET", prior to extra time — it is not a shootout substitution, and two of the
// matches carrying one never reached a shootout at all).
// 10 is after the full-time whistle, stamped "90'", and is NOT extra time: two
// regulation matches carry period-10 events, and reading those as extra time would hand
// 22 players 30 phantom minutes each.
const PERIOD_MINUTE = { 4: 45, 8: 105, 11: 120, 17: 90 }
// a match reached extra time iff it carries an event in one of these periods: ET first
// half, ET break, ET second half, shootout kick, pre-ET substitution. Clock-based tests
// don't work — one regulation match ran to 109' on stoppage alone.
const ET_PERIODS = new Set([7, 8, 9, 11, 17])

// elapsed minute of an event under the capped convention: stoppage doesn't count, so a
// goal at "45'+2'" is minute 45 and one at "90'+5'" is minute 90. `length` is the
// match's own full time (90, or 120 once extra time was played).
function eventMinute(minute, period, length) {
  const s = String(minute ?? '')
  const m = /^(\d+)/.exec(s)
  if (!m) return PERIOD_MINUTE[period] ?? null
  const base = parseInt(m[1], 10)
  // a substitution in the stoppage time that ends the match: the player withdrawn is
  // credited all but the last minute and the one replacing them gets that minute, which
  // is how Opta and ESPN score it (verified player by player against ESPN's box score).
  // Stoppage anywhere else still contributes nothing.
  if (s.includes('+') && base >= length) return length - 1
  return base
}

/**
 * Minutes played per player across the tournament, from the lineups we already hold.
 * FIFA publishes no minutes-played endpoint (the aggregate stats routes are 404 or
 * return literal null), so this is derived: starters from 0, substitutes from the
 * minute they came on, everyone until they're withdrawn, sent off, or the match ends.
 *
 * Someone who came on and someone who never left the bench are different things: the
 * first always gets an entry here (1 minute at the very least), the second gets none.
 * Callers must not collapse "no entry" and 0 into one falsy state.
 */
function computeMinutes(lineups, matches) {
  const byId = Object.fromEntries(matches.map((m) => [m.id, m]))
  const mins = {}
  for (const [matchId, lu] of Object.entries(lineups)) {
    // an in-progress match has no settled minutes; it lands on the next run
    if (byId[matchId]?.status !== 'finished') continue
    const periods = ['home', 'away'].flatMap((s) =>
      [...(lu[s]?.goals || []), ...(lu[s]?.bookings || []), ...(lu[s]?.substitutions || [])].map(
        (e) => e.period,
      ),
    )
    const length = periods.some((p) => ET_PERIODS.has(p)) ? 120 : 90
    for (const side of ['home', 'away']) {
      const team = lu[side]
      if (!team) continue
      const on = {}
      const off = {}
      for (const p of team.xi || []) on[p.id] = 0
      for (const s of team.substitutions || []) {
        const min = eventMinute(s.minute, s.period, length)
        if (min == null) continue
        if (s.on != null) on[s.on] = min
        if (s.off != null) off[s.off] = min
      }
      for (const b of team.bookings || []) {
        // card 2+ is a dismissal; a card with no IdPlayer went to a coach or official
        if (!b.player || (b.card ?? 0) < 2) continue
        const min = eventMinute(b.minute, b.period, length)
        if (min != null && (off[b.player] == null || min < off[b.player])) off[b.player] = min
      }
      // a dismissal for someone who never came on leaves an `off` with no `on`: ignored,
      // since only players present in `on` actually took the field
      for (const [pid, start] of Object.entries(on))
        mins[pid] = (mins[pid] ?? 0) + Math.max(0, Math.min(off[pid] ?? length, length) - start)
    }
  }
  return mins
}

function computeStats(lineups, matches) {
  const scorers = {}
  const byId = Object.fromEntries(matches.map((m) => [m.id, m]))
  // FIFA player id -> { name, code, no }. The shirt number is stable across the
  // tournament and lets the UI link a scorer/booking to that player's squad card
  // (joined by team + number); name and team cover players who reach a leaderboard
  // without ever scoring, i.e. the minutes-played one
  const playerMeta = {}
  const numberOf = {}
  for (const [matchId, lu] of Object.entries(lineups)) {
    const m = byId[matchId]
    if (!m) continue
    for (const side of ['home', 'away']) {
      const code = m[side]?.code
      if (!code) continue
      for (const p of [...(lu[side]?.xi || []), ...(lu[side]?.subs || [])]) {
        if (p.number != null) numberOf[p.id] = p.number
        playerMeta[p.id] = { name: p.name, code, no: numberOf[p.id] }
      }
    }
  }
  for (const [matchId, lu] of Object.entries(lineups)) {
    const m = byId[matchId]
    if (!m) continue
    for (const side of ['home', 'away']) {
      const team = lu[side]
      if (!team) continue
      const other = side === 'home' ? 'away' : 'home'
      const nameIn = (sd, pid) =>
        (lu[sd]?.xi || []).concat(lu[sd]?.subs || []).find((p) => p.id === pid)?.name || `#${pid}`
      // the record for a player, created on first goal/assist. `sd` is the side they
      // play for, which for an own goal is the side that didn't benefit from it
      const entry = (sd, pid) => {
        const code = m[sd]?.code
        if (!code) return null
        scorers[pid] ??= {
          id: pid,
          name: nameIn(sd, pid),
          code,
          no: numberOf[pid],
          goals: 0,
          assists: 0,
          ownGoals: 0,
        }
        return scorers[pid]
      }
      for (const g of team.goals || []) {
        if (g.period === 11) continue // penalty shootout
        if (g.player == null) continue // no IdPlayer: can't attribute (see bookings below)
        const own = g.type === 3
        const rec = entry(own ? other : side, g.player)
        if (!rec) continue
        if (own) rec.ownGoals++
        else rec.goals++
      }
      for (const a of team.assists || []) {
        if (a.player == null) continue
        const rec = entry(side, a.player)
        if (rec) rec.assists++
      }
    }
  }
  // everyone who took the field, so the minutes-played board isn't limited to scorers
  const minsById = computeMinutes(lineups, matches)
  for (const [pid, meta] of Object.entries(playerMeta)) {
    if (minsById[pid] == null) continue // unused substitute: never played
    scorers[pid] ??= {
      id: pid,
      name: meta.name,
      code: meta.code,
      no: meta.no,
      goals: 0,
      assists: 0,
      ownGoals: 0,
    }
  }
  for (const s of Object.values(scorers)) s.mins = minsById[s.id] ?? 0
  // discipline: player bookings (card 1 = yellow, >=2 = red incl. second yellow)
  const carded = {}
  let yellow = 0
  let red = 0
  for (const [matchId, lu] of Object.entries(lineups)) {
    const m = byId[matchId]
    if (!m) continue
    for (const side of ['home', 'away']) {
      const team = lu[side]
      if (!team) continue
      const code = m[side]?.code
      if (!code) continue
      const nameOf = (pid) =>
        (team.xi || []).concat(team.subs || []).find((p) => p.id === pid)?.name || `#${pid}`
      for (const b of team.bookings || []) {
        // cards shown to a coach or other team official (no IdPlayer) still cost the
        // team conduct score, but they aren't player cards: they belong in neither the
        // tournament tallies nor the per-player table.
        if (b.player == null) continue
        const isRed = (b.card ?? 0) >= 2
        if (isRed) red++
        else yellow++
        const key = `${b.player}`
        carded[key] ??= { id: b.player, name: nameOf(b.player), code, no: numberOf[b.player], y: 0, r: 0 }
        if (isRed) carded[key].r++
        else carded[key].y++
      }
    }
  }

  // team conduct ("fair play") score per team — same scheme as the standings
  // tiebreaker (criterion f): one deduction per player or team official per match,
  // worst card only (Y -1, second yellow / yellow+red -3, direct red -4). Computed
  // for group-stage matches and for all matches; 0 means no deductions.
  const fairPlayOver = (ms) => {
    const score = {}
    for (const m of ms) {
      if (m.status !== 'finished' || !m.home || !m.away) continue
      const lu = lineups[m.id]
      if (!lu) continue
      for (const side of ['home', 'away']) {
        const code = m[side]?.code
        const tl = lu[side]
        if (!code || !tl) continue
        score[code] ??= 0
        const byPerson = {}
        ;(tl.bookings || []).forEach((b, i) => {
          const key = bookedBy(b, i)
          byPerson[key] = byPerson[key] ?? []
          byPerson[key].push(b)
        })
        for (const cards of Object.values(byPerson)) {
          const reds = cards.filter((b) => (b.card ?? 0) >= 2).length
          const yellows = cards.filter((b) => b.card === 1).length
          if (reds > 0) score[code] += yellows >= 1 ? -3 : -4
          else if (yellows >= 2) score[code] += -3
          else if (yellows === 1) score[code] += -1
        }
      }
    }
    return score
  }
  const fairPlay = {
    group: fairPlayOver(matches.filter((m) => m.stage === 'group')),
    all: fairPlayOver(matches),
  }

  // tournament-wide odds and ends from finished matches
  const fin = matches.filter((m) => m.status === 'finished' && m.home && m.away)
  // FIFA occasionally ships garbage in Attendance (seen: 4e9 for the opener) —
  // only values that fit in a real stadium count
  const att = fin
    .map((m) => Number(m.attendance))
    .filter((v) => Number.isFinite(v) && v >= 1000 && v <= 150000)
  const attAvg = att.length ? Math.round(att.reduce((a, v) => a + v, 0) / att.length) : null
  let biggestWin = null
  for (const m of fin) {
    const diff = Math.abs((m.home.score ?? 0) - (m.away.score ?? 0))
    if (diff > 0 && (!biggestWin || diff > biggestWin.diff))
      biggestWin = { diff, id: m.id, h: m.home.code, a: m.away.code, hs: m.home.score, as: m.away.score }
  }
  let fastestGoal = null
  for (const [matchId, lu] of Object.entries(lineups)) {
    const m = byId[matchId]
    if (!m) continue
    for (const side of ['home', 'away']) {
      for (const g of lu[side]?.goals || []) {
        if (g.period === 11 || g.type === 3 || !g.minute) continue
        const min = parseInt(g.minute, 10)
        if (!Number.isFinite(min)) continue
        // within a shared minute, the exact second decides (two goals can both
        // read "2'" yet be 65s vs 72s); fall back to the minute when sec is absent
        const sec = Number.isFinite(g.sec) ? g.sec : min * 60
        if (!fastestGoal || min < fastestGoal.min || (min === fastestGoal.min && sec < fastestGoal.sec)) {
          const sd = side
          const name =
            (lu[sd]?.xi || []).concat(lu[sd]?.subs || []).find((p) => p.id === g.player)?.name ||
            `#${g.player}`
          fastestGoal = { min, sec, minute: g.minute, name, code: m[sd]?.code ?? null, id: m.id }
        }
      }
    }
  }

  // three independent top-40 boards over the same rows, each led by its own column and
  // falling through to the adidas Golden Boot criteria (goals, assists, fewest minutes)
  const tallies = Object.values(scorers)
  const board = (has, key) =>
    tallies
      .filter(has)
      .sort((a, b) => {
        const ka = key(a)
        const kb = key(b)
        for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]
        return a.name.localeCompare(b.name)
      })
      .slice(0, 40)

  return {
    scorers: board(
      (s) => s.goals > 0,
      (s) => [-s.goals, -s.assists, s.mins],
    ),
    assisters: board(
      (s) => s.assists > 0,
      (s) => [-s.assists, -s.goals, s.mins],
    ),
    minutes: board(
      (s) => s.mins > 0,
      (s) => [-s.mins, -s.goals, -s.assists],
    ),
    cards: {
      yellow,
      red,
      players: Object.values(carded)
        .sort((a, b) => b.r - a.r || b.y - a.y || a.name.localeCompare(b.name))
        .slice(0, 20),
    },
    attAvg,
    biggestWin,
    fastestGoal,
    fairPlay,
  }
}

// ---------------------------------------------------------------- flags (downloaded once, served locally)

// flat flags at a fixed 120px height and the official aspect ratio (flagcdn h-series).
// The app letterboxes them into its 4:3 slots (object-fit: contain) — no cropping of
// square (CH) or 2:1 flags, unlike the old width-series + cover approach.
async function downloadFlags(fifaIso, broadcasters) {
  const dir = path.join(ROOT, 'public', 'flags')
  await fs.mkdir(dir, { recursive: true })
  const codes = new Set(Object.values(fifaIso).map((c) => c.toLowerCase()))
  for (const m of broadcasters?.markets || []) codes.add(m.iso2.toLowerCase())
  for (const c of ['us', 'ca', 'mx']) codes.add(c)
  let downloaded = 0
  for (const code of codes) {
    if (!safeId(code)) {
      warn(`flag ${JSON.stringify(code)}: fails identifier check — skipped`)
      continue
    }
    const file = path.join(dir, `${code}.png`)
    try {
      await fs.access(file)
      continue
    } catch {
      /* missing — fetch it */
    }
    try {
      const res = await fetch(`https://flagcdn.com/h120/${code}.png`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fs.writeFile(file, Buffer.from(await res.arrayBuffer()))
      downloaded++
      await sleep(60)
    } catch (e) {
      warn(`flag ${code}: ${e.message}`)
    }
  }
  if (downloaded) log(`flags: downloaded ${downloaded} (${codes.size} total)`)
  return codes.size
}

// --------------------------------------------- base-camp geocoding (Open-Meteo, cached)

/** fill teams[].baseCamp.lat/lon from the camp city via Open-Meteo's free geocoder */
async function geocodeBaseCamps(teams) {
  const cacheFile = path.join(CACHE, 'geocode.json')
  const cache = (await readJsonSafe(cacheFile)) || {}
  // failed lookups must never be cached — purge legacy null/invalid entries so
  // they get retried instead of poisoning the committed cache forever
  let purged = 0
  for (const [k, v] of Object.entries(cache)) {
    if (!v || !Number.isFinite(v.lat) || !Number.isFinite(v.lon)) {
      delete cache[k]
      purged++
    }
  }
  let queried = 0
  for (const t of Object.values(teams)) {
    const bc = t.baseCamp
    if (!bc?.city) continue
    const key = `${bc.city}|${bc.country || ''}`
    if (!(key in cache)) {
      try {
        const d = await fetchJson(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(bc.city)}&count=5&language=en`,
        )
        const hit =
          (d.results || []).find((r) => !bc.country || r.country_code === bc.country) || (d.results || [])[0]
        if (hit && Number.isFinite(hit.latitude) && Number.isFinite(hit.longitude)) {
          cache[key] = { lat: hit.latitude, lon: hit.longitude }
          queried++
        } else {
          warn(`geocode ${bc.city}: no usable result — not cached, will retry next run`)
        }
        await sleep(300)
      } catch (e) {
        warn(`geocode ${bc.city}: ${e.message}`)
        continue
      }
    }
    if (cache[key]) {
      bc.lat = cache[key].lat
      bc.lon = cache[key].lon
    }
  }
  if (queried || purged) {
    await writeJson(cacheFile, cache)
    log(`geocoded ${queried} base-camp cities${purged ? `, purged ${purged} stale null entries` : ''}`)
  }
}

// ---------------------------------------------------------------- weather (Open-Meteo)

async function fetchWeather(matches, venues) {
  const out = (await readJsonSafe(path.join(OUT, 'weather.json'))) || {}
  const byVenue = {}
  for (const m of matches) {
    if (!m.venueId || !venues[m.venueId]) continue
    byVenue[m.venueId] ??= []
    byVenue[m.venueId].push(m)
  }
  for (const [vid, ms] of Object.entries(byVenue)) {
    const v = venues[vid]
    try {
      const d = await fetchJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${v.lat}&longitude=${v.lon}` +
          `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,relative_humidity_2m` +
          `&forecast_days=16&past_days=2&timezone=UTC`, // past_days: post-match updates store actual conditions
      )
      const idx = Object.fromEntries(d.hourly.time.map((t, i) => [t, i]))
      for (const m of ms) {
        // round kickoff to the nearest forecast hour (:30 kickoffs would otherwise truncate down)
        const hour = `${new Date(Math.round(Date.parse(m.date) / 3600e3) * 3600e3).toISOString().slice(0, 13)}:00`
        const i = idx[hour]
        if (i === undefined) continue
        out[m.id] = {
          tC: d.hourly.temperature_2m[i],
          feelsC: d.hourly.apparent_temperature[i],
          pp: d.hourly.precipitation_probability[i],
          code: d.hourly.weather_code[i],
          windKmh: d.hourly.wind_speed_10m[i],
          rh: d.hourly.relative_humidity_2m[i],
          fetchedAt: new Date().toISOString(),
        }
      }
      await sleep(250)
    } catch (e) {
      warn(`weather ${v.realName}: ${e.message}`)
    }
  }
  return out
}

// ---------------------------------------------------------------- main

async function main() {
  log('update starting')
  await fs.mkdir(OUT, { recursive: true })
  await fs.mkdir(CACHE, { recursive: true })

  const curatedVenues = (await readJsonSafe(path.join(CURATED, 'venues.json')))?.venues || {}
  const climate = (await readJsonSafe(path.join(CURATED, 'climate.json')))?.venues || {}
  const venuesResearch = (await readJsonSafe(path.join(CURATED, 'venues-research.json')))?.venues || {}
  const cityL10nDoc = await readJsonSafe(path.join(CURATED, 'city-l10n.json'))
  const cityL10n = cityL10nDoc?.cities || {}
  const stadiumL10n = cityL10nDoc?.stadiums || {}
  // every venue name field covers all 21 data languages: curated overrides
  // first, then English for Latin-script languages that use the original name
  const fillLangs = (obj) => {
    if (!obj?.en) return obj
    for (const l of [...LANGS, ...CLDR_LANGS]) if (!obj[l]) obj[l] = obj.en
    return obj
  }
  const teamL10n = (await readJsonSafe(path.join(CURATED, 'team-names-l10n.json'))) || {}
  const teamsExtra = (await readJsonSafe(path.join(CURATED, 'teams-extra.json')))?.teams || {}
  const fifaIso = (await readJsonSafe(path.join(CURATED, 'fifa-iso.json')))?.map || {}
  const broadcasters = await readJsonSafe(path.join(CURATED, 'broadcasters.json'))

  // 1. matches + localized names
  const { matches, names, raw } = await fetchMatches()
  const rawById = Object.fromEntries(raw.map((m) => [m.IdMatch, m]))

  // 2. teams skeleton from match data
  const fifaTeamIds = {}
  for (const m of raw) {
    for (const s of [m.Home, m.Away]) if (s?.IdCountry) fifaTeamIds[s.IdCountry] = s.IdTeam
  }
  const groupOf = {}
  for (const m of matches) {
    if (m.stage !== 'group') continue
    for (const s of [m.home, m.away]) if (s) groupOf[s.code] = m.group
  }

  // 3a. squads from Wikipedia (official FIFA 26-player lists; refreshed every run)
  // partial parses must never lose teams we already have — merge over the previous file
  const oldSquads = (await readJsonSafe(path.join(OUT, 'squads.json'))) || {}
  let squads = {}
  try {
    squads = await fetchWikiSquads()
    for (const [code, old] of Object.entries(oldSquads)) {
      if (!squads[code]) {
        squads[code] = old
        warn(`squad ${code} missing from wiki parse — kept previous data`)
        continue
      }
      // suspicious shrink (mid-edit page, vandalism, template churn): a fresh
      // parse well below the previous size must not overwrite a good squad
      const oldN = old.players?.length ?? 0
      const newN = squads[code].players?.length ?? 0
      if (newN < Math.min(oldN, 26) - 3) {
        squads[code] = old
        warn(
          `squad ${code} shrank suspiciously in wiki parse (${newN} < ${oldN} players) — kept previous data`,
        )
      }
    }
    // career caps/goals are a frozen pre-tournament snapshot: Wikipedia lists them
    // "correct as of the start of the tournament", so we never overwrite the numbers
    // we already have. the team page shows a live career total by adding this World
    // Cup's tally on top (caps + wcApps, goals + wcGoals); freezing the base here is
    // what keeps that sum from ever double-counting if an editor later folds the
    // World Cup goals back into the wiki squad table. roster, club, position, captain
    // and coach all still refresh from wiki every run; only caps/goals are pinned.
    for (const [code, sq] of Object.entries(squads)) {
      const prev = oldSquads[code]
      if (!prev) continue // first time we see this team: keep the fresh wiki numbers
      const byId = {}
      const byNo = {}
      for (const op of prev.players || []) {
        if (op.id) byId[op.id] = op
        if (op.no != null) byNo[op.no] = op
      }
      for (const p of sq.players || []) {
        const op = byId[p.id] ?? (p.no != null ? byNo[p.no] : null)
        if (!op) continue // newly added player: keep the fresh wiki numbers as the base
        if (op.caps != null) p.caps = op.caps // gap-fill only: a null base still takes wiki
        if (op.goals != null) p.goals = op.goals
      }
    }
    const sizes = Object.values(squads).map((s) => s.players.length)
    log(`wiki squads: ${Object.keys(squads).length} teams, ${sizes.reduce((a, b) => a + b, 0)} players`)
    for (const [code, s] of Object.entries(squads)) {
      if (s.players.length < 23 || s.players.length > 26) warn(`squad size ${code}: ${s.players.length}`)
    }
  } catch (e) {
    warn(`wiki squads: ${e.message}`)
    squads = oldSquads
  }

  // 3b. team colors / nicknames / official sites: hand-curated, zero network
  const teamsStatic = (await readJsonSafe(path.join(CURATED, 'teams-static.json')))?.teams || {}
  // team codes become JSON keys, client routes, flag URLs and file names —
  // never let a garbled remote value through
  const codes = Object.keys(groupOf)
    .filter((c) => {
      if (safeId(c)) return true
      warn(`team code ${JSON.stringify(c)}: fails identifier check — skipped`)
      return false
    })
    .sort()

  // 4. assemble teams.json
  // FIFA ranking is FROZEN to the official 2026-06-11 release (the last one before the
  // World Cup): fetched once into scripts/curated/fifa-ranking.json and never refreshed
  // here. Feeds the ranking display, tie-break criteria g/h, and the model's FIFA-points
  // leg. The curated teams-extra snapshot stays as a last-resort fallback.
  const officialRanks = (await readJsonSafe(path.join(CURATED, 'fifa-ranking.json')))?.ranking || {}
  log(`FIFA ranking (frozen 2026-06-11): ${Object.keys(officialRanks).length} teams`)
  const teams = {}
  for (const code of codes) {
    const extra = teamsExtra[code] || {}
    const st = teamsStatic[code] || {}
    teams[code] = {
      code,
      fifaId: fifaTeamIds[code] || null,
      group: groupOf[code],
      name: {
        ...withCldrNames(names.teams[code] || { en: code }, fifaIso[code]),
        ...(teamL10n['zh-TW']?.[code] ? { 'zh-TW': teamL10n['zh-TW'][code] } : {}),
        ...(teamL10n.perTeam?.[code] || {}),
      },
      iso2: fifaIso[code] || null,
      ranking: officialRanks[code]?.rank ?? extra.fifaRanking ?? null,
      rankingPrev: officialRanks[code]?.prev ?? null,
      baseCamp: extra.baseCamp ?? null,
      colors: st.colors || [],
      nickname: st.nickname || null,
      web: st.web || null,
      flag: `https://api.fifa.com/api/v3/picture/flags-sq-3/${code}`,
    }
  }

  // 4b. base-camp coordinates for the map (cached; ~one-time)
  await geocodeBaseCamps(teams)

  // 5. venues.json (curated + FIFA localized names + climate + research merge)
  const venues = {}
  for (const [vid, v] of Object.entries(curatedVenues)) {
    const r = venuesResearch[vid] || {}
    const wikiTitle = v.realName.replace(/\s*\(.*\)\s*$/, '')
    venues[vid] = {
      id: vid,
      ...v,
      wiki: {
        title: wikiTitle,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, '_'))}`,
      },
      capacity: r.wcCapacity || v.capacity,
      note: r.note || null,
      fifaName: names.stadiums[vid]
        ? fillLangs({ ...names.stadiums[vid], ...(stadiumL10n[vid] || {}) })
        : null,
      cityName:
        names.cities[vid] || cityL10n[vid]
          ? fillLangs({ ...(names.cities[vid] || {}), ...(cityL10n[vid] || {}) })
          : null,
      climate: climate[vid] || null,
      matches: matches.filter((m) => m.venueId === vid).map((m) => m.id),
    }
  }

  // 6. live lineups + stats
  const lineups = await fetchLiveDetails(matches, rawById)
  const stats = computeStats(lineups, matches)
  stats.suspensions = computeSuspensions(lineups, matches)
  attachWcStats(squads, lineups, matches) // per-player apps/goals onto squads

  // 7. standings (needs lineups for the fair-play tiebreaker)
  const standings = computeStandings(matches, teams, lineups)

  // 8. weather
  let weather = (await readJsonSafe(path.join(OUT, 'weather.json'))) || {}
  if (!SKIP_WEATHER) weather = await fetchWeather(matches, venues)

  // 8b. country flags served locally (idempotent — only fetches missing files)
  const flagCount = await downloadFlags(fifaIso, broadcasters)

  // 8c. win/draw/loss probabilities (Elo over martj42/international_results, CC0)
  let probs = {}
  let titleOdds = (await readJsonSafe(path.join(OUT, 'meta.json')))?.titleOdds || []
  const prevProbs = (await readJsonSafe(path.join(OUT, 'probs.json'))) || {}
  try {
    const csvPath = path.join(CACHE, 'intl-results.csv')
    let csv = null
    try {
      const st = await fs.stat(csvPath)
      if (Date.now() - st.mtimeMs < 20 * 3600e3) csv = await fs.readFile(csvPath, 'utf8')
    } catch {}
    if (!csv) {
      const res = await fetch(RESULTS_URL)
      if (!res.ok) throw new Error(`results.csv HTTP ${res.status}`)
      csv = await res.text()
      await fs.writeFile(csvPath, csv)
    }
    const { ratings, outcomeCurve, offsets } = replay(csv)
    const DATASET_NAME = {
      ALG: 'Algeria',
      ARG: 'Argentina',
      AUS: 'Australia',
      AUT: 'Austria',
      BEL: 'Belgium',
      BIH: 'Bosnia and Herzegovina',
      BRA: 'Brazil',
      CAN: 'Canada',
      CIV: 'Ivory Coast',
      COD: 'DR Congo',
      COL: 'Colombia',
      CPV: 'Cape Verde',
      CRO: 'Croatia',
      CUW: 'Curaçao',
      CZE: 'Czech Republic',
      ECU: 'Ecuador',
      EGY: 'Egypt',
      ENG: 'England',
      ESP: 'Spain',
      FRA: 'France',
      GER: 'Germany',
      GHA: 'Ghana',
      HAI: 'Haiti',
      IRN: 'Iran',
      IRQ: 'Iraq',
      JOR: 'Jordan',
      JPN: 'Japan',
      KOR: 'South Korea',
      KSA: 'Saudi Arabia',
      MAR: 'Morocco',
      MEX: 'Mexico',
      NED: 'Netherlands',
      NOR: 'Norway',
      NZL: 'New Zealand',
      PAN: 'Panama',
      PAR: 'Paraguay',
      POR: 'Portugal',
      QAT: 'Qatar',
      RSA: 'South Africa',
      SCO: 'Scotland',
      SEN: 'Senegal',
      SUI: 'Switzerland',
      SWE: 'Sweden',
      TUN: 'Tunisia',
      TUR: 'Turkey',
      URU: 'Uruguay',
      USA: 'United States',
      UZB: 'Uzbekistan',
    }
    const CONFED_OF = {}
    for (const [conf, names] of Object.entries(CONFED_LISTS)) {
      for (const [code, dsName] of Object.entries(DATASET_NAME)) {
        if (names.includes(dsName)) CONFED_OF[code] = conf
      }
    }
    const HOST_OF = { USA: 'US', CAN: 'CA', MEX: 'MX' }
    const elo = (code) => ratings.get(DATASET_NAME[code]) ?? null
    let missing = 0
    for (const m of matches) {
      if (!m.home || !m.away) continue
      // freeze at kickoff: the last pre-match value (the KO-10min run) is the
      // probability of record — post-match rating shifts must not rewrite history
      if (Date.parse(m.date) <= Date.now() && prevProbs[m.id]) {
        probs[m.id] = prevProbs[m.id]
        continue
      }
      const eh = elo(m.home.code)
      const ea = elo(m.away.code)
      if (eh == null || ea == null) {
        missing++
        continue
      }
      const vc = venues[m.venueId]?.country
      const bonus = HOST_OF[m.home.code] === vc ? 60 : HOST_OF[m.away.code] === vc ? -60 : 0
      // leg 1: replayed Elo, corrected by fitted inter-confederation offsets
      const adj = (offsets[CONFED_OF[m.home.code]] ?? 0) - (offsets[CONFED_OF[m.away.code]] ?? 0)
      const pElo = rawProbs(eh - ea + bonus + adj, outcomeCurve)
      // leg 2: official FIFA points — an independent rating with opposite
      // confederation biases — mapped via the SUM formula's 600 scale
      const ptsH = officialRanks[m.home.code]?.pts
      const ptsA = officialRanks[m.away.code]?.pts
      const pFifa =
        ptsH != null && ptsA != null ? rawProbs(((ptsH - ptsA) * 400) / 600 + bonus, outcomeCurve) : null
      probs[m.id] = intify(blend(pElo, pFifa), m.stage !== 'group')
    }
    if (missing) warn(`probs: ${missing} matches missing elo mapping`)
    log(`probs: ${Object.keys(probs).length} fixtures scored`)
    // compact model for the client-side tournament forecast (Monte-Carlo simulation): per-team strengths
    // (confed offset folded into elo) + the empirical outcome curve
    const simTeams = {}
    for (const code of Object.keys(teams)) {
      const e = elo(code)
      if (e == null) continue
      simTeams[code] = {
        r: Math.round(e + (offsets[CONFED_OF[code]] ?? 0)),
        f: officialRanks[code]?.pts != null ? Math.round(officialRanks[code].pts) : null,
      }
    }
    const simModel = {
      curve: outcomeCurve.map((b) => ({ w: +b.w.toFixed(4), d: +b.d.toFixed(4) })),
      hostBonus: 60,
      teams: simTeams,
    }
    await writeJson(path.join(OUT, 'sim-model.json'), simModel)

    // 10,000-run Monte-Carlo title odds for the schedule page strip (continue
    // mode: real results kept, so the odds drift with the tournament)
    const { runTournament } = await import('../src/sim/engine.ts')
    const champs = new Map()
    const RUNS = 10000
    for (let i = 0; i < RUNS; i++) {
      const run = runTournament(simModel, matches, venues, teams, () => true)
      champs.set(run.champion, (champs.get(run.champion) ?? 0) + 1)
    }
    titleOdds = [...champs.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 5)
      .map(([c, n]) => ({ c, p: +((n / RUNS) * 100).toFixed(1) }))
    log(`title odds: ${titleOdds.map((o) => `${o.c} ${o.p}%`).join(', ')}`)

    // biggest upset, measured in bits of surprise: log2(pFav / pActual), the
    // favourite's expected outcome over the one that happened. Group matches use
    // the 90' h/d/a — a heavy favourite held to a draw counts, a loss counts more;
    // knockout matches (once they carry probs) use total advancement probability
    // (`ah` already folds in extra time + penalties). p stores the favourite's
    // pre-match win/advance probability for display.
    const MIN_UPSET_BITS = 1 // hide trivial results (favourite roughly got its due)
    const floorPct = (x) => Math.max(x, 0.5) // integer probs can round down to 0
    let upset = null
    for (const m of matches) {
      if (m.status !== 'finished' || !m.home || !m.away) continue
      const pr = probs[m.id]
      if (!pr) continue
      let bits = 0
      let favPct = 0
      if (pr.ah != null) {
        // knockout: was the team that advanced the underdog?
        const qHome = pr.ah
        const qAway = 100 - pr.ah
        const favHome = qHome >= qAway
        const favCode = favHome ? m.home.code : m.away.code
        if (m.winner && m.winner !== favCode) {
          favPct = Math.max(qHome, qAway)
          bits = Math.log2(floorPct(favPct) / floorPct(favHome ? qAway : qHome))
        }
      } else {
        // group / 90': the favourite failed to win (draw or defeat)
        const favHome = pr.h >= pr.a
        favPct = Math.max(pr.h, pr.a)
        const favWon = favHome ? m.home.score > m.away.score : m.away.score > m.home.score
        if (!favWon) {
          const actual = m.home.score > m.away.score ? pr.h : m.away.score > m.home.score ? pr.a : pr.d
          bits = Math.log2(floorPct(favPct) / floorPct(actual))
        }
      }
      if (bits >= MIN_UPSET_BITS && (!upset || bits > upset.bits))
        upset = {
          bits: +bits.toFixed(2),
          p: favPct,
          id: m.id,
          h: m.home.code,
          a: m.away.code,
          hs: m.home.score,
          as: m.away.score,
        }
    }
    stats.upset = upset
  } catch (e) {
    warn(`probs: ${e.message} — keeping previous file`)
    probs = prevProbs
  }

  // 9. write everything
  await writeJson(path.join(OUT, 'matches.json'), { matches })
  await writeJson(path.join(OUT, 'teams.json'), { teams })
  await writeJson(path.join(OUT, 'venues.json'), { venues })
  await writeJson(path.join(OUT, 'standings.json'), standings)
  await writeJson(path.join(OUT, 'lineups.json'), lineups)
  await writeJson(path.join(OUT, 'stats.json'), stats)
  await writeJson(path.join(OUT, 'weather.json'), weather)
  await writeJson(path.join(OUT, 'probs.json'), probs)
  await writeJson(path.join(OUT, 'squads.json'), squads)
  // per-team squad payloads (small fetches for the team detail page; the
  // monolithic squads.json above is kept for compatibility)
  let squadFiles = 0
  for (const [code, s] of Object.entries(squads)) {
    if (!safeId(code)) {
      warn(`squad file ${JSON.stringify(code)}: fails identifier check — skipped`)
      continue
    }
    const file = path.join(OUT, 'squads', `${code}.json`)
    await fs.mkdir(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    await fs.writeFile(
      tmp,
      `${JSON.stringify({ coach: s.coach, wiki: s.wiki, players: s.players }, null, 1)}\n`,
    )
    await fs.rename(tmp, file)
    squadFiles++
  }
  log(`wrote ${squadFiles} per-team squad files (public/data/squads/)`)
  if (broadcasters) await writeJson(path.join(OUT, 'broadcasters.json'), broadcasters)
  await writeJson(path.join(OUT, 'meta.json'), {
    updatedAt: new Date().toISOString(),
    season: ID_SEASON,
    titleOdds,
    counts: {
      matches: matches.length,
      teams: Object.keys(teams).length,
      squads: Object.keys(squads).length,
      weather: Object.keys(weather).length,
      lineups: Object.keys(lineups).length,
      flags: flagCount,
    },
    errors,
    sources: [
      'api.fifa.com',
      'en.wikipedia.org',
      'open-meteo.com',
      'github.com/martj42/international_results',
    ],
  })
  log(`done. ${errors.length} warnings`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
