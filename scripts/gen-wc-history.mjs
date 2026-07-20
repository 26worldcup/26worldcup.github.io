// One-time generator for public/data/wc-history.json (per-team World Cup history).
// FROZEN data (history is the past); NOT part of `npm run update`. Regenerate with:
//
//     node scripts/gen-wc-history.mjs
//
// Sources, by field:
//   - match stats (P/W/D/L, GF/GA) and which tournaments were played: derived from
//     scripts/cache/intl-results.csv (martj42/international_results, CC0) -- penalty
//     shootouts aren't recorded, so a pens-decided knockout counts as a draw, which
//     matches FIFA's official all-time-record convention.
//   - finish (round reached) and reason for absence: scraped from each team's English
//     Wikipedia "Competitive record" -> FIFA World Cup record table (the Result column),
//     via a rowspan/colspan-aware grid parser. The page title per team is in
//     scripts/curated/wc-history.json.
//   - host country per tournament: scripts/curated/wc-history.json (small shared map,
//     with overrides for West Germany 1974 and the 1861-1946 Italian flag).

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATASET_NAME } from './elo.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CSV_PATH = path.join(ROOT, 'scripts/cache/intl-results.csv')
const CURATED_PATH = path.join(ROOT, 'scripts/curated/wc-history.json')
const FIFA_ISO_PATH = path.join(ROOT, 'src/data/fifa-iso.json')
const OUT_PATH = path.join(ROOT, 'public/data/wc-history.json')
const UA = 'wc2026-app/1.0 (one-time World Cup history generator; contact: repo owner)'

// FIFA tri-code -> martj42 dataset country name, for finding each team's WC matches
// (shared with scripts/elo.mjs, which every other pipeline script also draws from)

// teams whose Wikipedia record absorbs a predecessor nation's results (FIFA treats
// them as the same lineage); match the predecessor's CSV name too
const CSV_ALIAS = { CZE: ['Czechoslovakia'] }

const warnings = []
const warn = (m) => warnings.push(m)
const clean = (s) =>
  s
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ') // drop TemplateStyles CSS text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// ---------------------------------------------------------------- CSV (stats)

/** RFC-4180-ish CSV parse (handles quoted fields with embedded commas) */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c === '\r') {
      /* skip */
    } else field += c
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// ------------------------------------------------------- Wikipedia (labels)

// build a row/col grid from an HTML table, honoring rowspan + colspan
function tableGrid(tableHtml) {
  const trs = [...tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0])
  const grid = []
  let carry = {}
  trs.forEach((tr, r) => {
    const row = []
    const nextCarry = {}
    for (const col in carry) {
      row[col] = carry[col].text
      if (carry[col].left > 1) nextCarry[col] = { text: carry[col].text, left: carry[col].left - 1 }
    }
    const cells = [...tr.matchAll(/<(t[hd])\b([^>]*)>([\s\S]*?)<\/\1>/g)].map((m) => ({
      text: clean(m[3]),
      colspan: Math.max(1, Number((m[2].match(/colspan=["']?(\d+)/) || [])[1] || 1)),
      rowspan: Math.max(1, Number((m[2].match(/rowspan=["']?(\d+)/) || [])[1] || 1)),
    }))
    let c = 0
    for (const cell of cells) {
      while (row[c] !== undefined) c++
      for (let k = 0; k < cell.colspan; k++) {
        row[c + k] = cell.text
        if (cell.rowspan > 1) nextCarry[c + k] = { text: cell.text, left: cell.rowspan - 1 }
      }
      c += cell.colspan
    }
    grid[r] = row
    carry = nextCarry
  })
  return grid
}

/**
 * map each World Cup year -> the team's "Result" column text (round reached, or reason).
 * Tables vary a lot between articles: the caption may be "FIFA World Cup record",
 * "…finals record" or just "FIFA World Cup"; "Year" and "Round"/"Result" may sit in
 * the same header row or in two stacked rows. So: pick the first table that mentions
 * FIFA World Cup and has Year + Round/Result columns, using the rowspan-aware grid.
 */
function yearResults(html, wcYears) {
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => m[0])
  for (const tbl of tables) {
    if (!/fifa world cup/i.test(clean(tbl).slice(0, 250))) continue
    const grid = tableGrid(tbl)
    let yearCol = -1
    let resCol = -1
    for (const row of grid) {
      row.forEach((c, ci) => {
        const v = (c || '').trim()
        if (yearCol < 0 && /^year$/i.test(v)) yearCol = ci
        if (resCol < 0 && /^(round|result)$/i.test(v)) resCol = ci
      })
      if (yearCol >= 0 && resCol >= 0) break
    }
    if (yearCol < 0 || resCol < 0) continue // e.g. a TV-rights table that also names the World Cup
    const out = new Map()
    for (const row of grid) {
      const years = (row[yearCol] || '').match(/\b(?:19|20)\d{2}\b/g)
      if (!years) continue
      const result = (row[resCol] || '').trim()
      if (years.length === 1) out.set(Number(years[0]), result)
      else {
        // a range row like "1930–1990 | Part of the Soviet Union": apply to every edition in it
        const lo = Math.min(...years.map(Number))
        const hi = Math.max(...years.map(Number))
        for (const y of wcYears) if (y >= lo && y <= hi) out.set(y, result)
      }
    }
    if (out.size) return out
  }
  return null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function wikiJson(params, tries = 5) {
  const url = `https://en.wikipedia.org/w/api.php?${params}&redirects=1&format=json&formatversion=2`
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.ok) return res.json()
    // 429 (rate limit) / 5xx are transient: respect Retry-After, else exponential backoff
    if (res.status === 429 || res.status >= 500) {
      const wait = Math.min((Number(res.headers.get('retry-after')) || 2 ** i) * 1000, 30000)
      await sleep(wait)
      continue
    }
    throw new Error(`wiki HTTP ${res.status}`)
  }
  throw new Error('wiki HTTP 429 (retries exhausted)')
}

/** fetch a team's year -> Result-text map from its Wikipedia article */
async function fetchWikiResults(title, wcYears) {
  const page = encodeURIComponent(title.replace(/ /g, '_'))
  const html = (await wikiJson(`action=parse&page=${page}&prop=text`)).parse.text
  let res = yearResults(html, wcYears)
  // some "<country> national football team" titles are disambiguation pages (men's
  // vs women's); follow the men's national team link and try again
  if (!res && /(?:might|may) refer to/i.test(clean(html).slice(0, 400))) {
    const m = html.match(/\/wiki\/([^"]*[Mm]en[^"]*national[^"]*team)/)
    if (m) res = yearResults((await wikiJson(`action=parse&page=${m[1]}&prop=text`)).parse.text, wcYears)
  }
  return res
}

// strip trailing footnote markers ("[1]", "note 1", ". a", " b", "*") from a label.
// the single-letter footnote must be separated by whitespace/period, so real words
// ending in a letter ("Did not qualify", "Banned") are left intact.
const cleanLabel = (t) =>
  t
    .replace(/\s*\[\d+\]\s*$/g, '')
    .replace(/\s*note\s*\d+\s*$/gi, '')
    .replace(/[\s.]+[a-z]\s*$/i, '')
    .replace(/\*+\s*$/g, '')
    .trim()
// lowercased, footnote-stripped, for mapping to a code
const normResult = (t) => cleanLabel(t).toLowerCase()
// a bare footnote marker ("Not admitted 55") survives cleanLabel's bracketed-ref
// strip; a reason label never legitimately ends in a number, unlike a round name
const cleanReason = (t) => cleanLabel(t).replace(/\s+\d{1,3}$/, '')
const normReason = (t) => cleanReason(t).toLowerCase()

const FINISH_MAP = [
  [/^(champions?|winners?)$/, 'W'],
  [/^runners?[- ]up$/, 'RU'],
  [/^third place$|^3rd\b|^third$/, '3'],
  [/^fourth place$|^4th\b|^fourth$/, '4'],
  [/^semi-?finals?$/, 'SF'],
  [/^quarter-?finals?$/, 'QF'],
  [/^round of 16$/, 'R16'],
  [/^round of 32$/, 'R32'],
  [/^second (group )?(stage|round|phase)$/, 'R2'], // checked before GS
  [/group stage|group phase|first round|^groups?$/, 'GS'],
]
const REASON_MAP = [
  [/did not qualify/, 'dnq'],
  [/withdr/, 'withdrew'],
  [/did not enter|did not participate|entry not accepted|could not enter|declined|refused to partic/, 'dne'],
  [/rejected by fifa|entry rejected/, 'rejected'],
  [/not eligible/, 'noteligible'],
  [/banned|disqualif|expelled|suspend|excluded|not admitted/, 'banned'],
  // "not a FIFA member", "not a member of FIFA" and the bare "not member of FIFA"
  [/not (a )?(fifa )?member|not affiliat/, 'notmember'],
]
// a team that did not exist as an independent nation yet -> "partOf:<iso>", so the
// app can name the state it belonged to in the reader's language. Historical states
// keep a code Intl.DisplayNames would mis-resolve (YU -> Serbia, SU -> Russia), so
// the app carries its own label for those two.
const ENTITY_ISO = {
  yugoslavia: 'YU',
  'soviet union': 'SU',
  france: 'FR',
  portugal: 'PT',
  'united kingdom': 'GB',
  japan: 'JP',
}
const BELONGED_MAP = [
  [/^part of (?:the )?(.+)$/, 'partOf'],
  [/^protectorate of (?:the )?(.+)$/, 'protectorateOf'],
]
const mapFinish = (t) => {
  const n = normResult(t)
  for (const [re, c] of FINISH_MAP) if (re.test(n)) return c
  return null
}
const mapReason = (t) => {
  const n = normReason(t)
  for (const [re, c] of REASON_MAP) if (re.test(n)) return c
  for (const [re, kind] of BELONGED_MAP) {
    const iso = ENTITY_ISO[re.exec(n)?.[1] ?? '']
    if (iso) return `${kind}:${iso}`
  }
  return null
}

// ---------------------------------------------------------------- hosts

const FINISH_RANK = { W: 0, RU: 1, 3: 2, 4: 3, SF: 4, QF: 5, R16: 6, R32: 7, R2: 7, GS: 8 }
const betterFinish = (a, b) => {
  if (!a) return b
  if (!b) return a
  return (FINISH_RANK[a] ?? 99) <= (FINISH_RANK[b] ?? 99) ? a : b
}

async function main() {
  const csvText = await fs.readFile(CSV_PATH, 'utf8')
  const curated = JSON.parse(await fs.readFile(CURATED_PATH, 'utf8'))
  const fifaIso = JSON.parse(await fs.readFile(FIFA_ISO_PATH, 'utf8')).map

  const enName = new Intl.DisplayNames(['en'], { type: 'region' })
  const isoToName = (iso) => {
    if (!iso) return null
    if (iso === 'GB-ENG') return 'England'
    if (iso === 'GB-SCT') return 'Scotland'
    if (iso === 'GB-WLS') return 'Wales'
    if (iso === 'GB-NIR') return 'Northern Ireland'
    try {
      return enName.of(iso) || iso
    } catch {
      return iso
    }
  }
  // resolve each tournament's host(s): code, "CODE,CODE", or {code,name?,flag?}
  const resolveHost = (val) => {
    const specs = typeof val === 'string' ? val.split(',').map((c) => ({ code: c.trim() })) : [val]
    return specs.map((s) => {
      const iso = fifaIso[s.code] || null
      if (!iso) warn(`host ${s.code}: no ISO2`)
      const ref = { iso, name: s.name || isoToName(iso) }
      if (s.flag) ref.flag = s.flag
      if (s.name) ref.loc = false
      return ref
    })
  }
  const hostByYear = {}
  for (const [year, val] of Object.entries(curated.hosts)) hostByYear[year] = resolveHost(val)
  const allYears = Object.keys(curated.hosts)
    .map(Number)
    .sort((a, b) => b - a)

  const rows = parseCsv(csvText)
  const idx = Object.fromEntries(rows[0].map((h, i) => [h.trim(), i]))
  const data = rows.slice(1).filter((r) => r.length >= 6 && r[idx.date])

  const out = {}
  for (const code of Object.keys(DATASET_NAME)) {
    const dsName = DATASET_NAME[code]
    // most pages are "<country> national football team"; curated.teams overrides the
    // exceptions (the men's-soccer pages, redirects that don't resolve, etc.)
    const wikiTitle = curated.teams?.[code]?.wiki ?? `${dsName} national football team`

    // per-tournament stats + played/missed, from the results CSV. Some teams inherit a
    // predecessor's FIFA record (Wikipedia lists it on their page), so match those names too.
    const names = [dsName, ...(CSV_ALIAS[code] || [])]
    const byYear = new Map()
    for (const r of data) {
      if (r[idx.tournament] !== 'FIFA World Cup') continue
      const home = r[idx.home_team]
      const away = r[idx.away_team]
      if (!names.includes(home) && !names.includes(away)) continue
      const year = Number(r[idx.date].slice(0, 4))
      if (!hostByYear[year]) continue // curated tournaments only (excludes the live 2026 WC)
      const isHome = names.includes(home)
      const gf = Number(isHome ? r[idx.home_score] : r[idx.away_score])
      const ga = Number(isHome ? r[idx.away_score] : r[idx.home_score])
      if (!Number.isFinite(gf) || !Number.isFinite(ga)) continue
      const e = byYear.get(year) || { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }
      e.p++
      e.gf += gf
      e.ga += ga
      if (gf > ga) e.w++
      else if (gf < ga) e.l++
      else e.d++
      byYear.set(year, e)
    }

    // finish / reason labels, from Wikipedia
    let results = null
    try {
      results = await fetchWikiResults(wikiTitle, allYears)
    } catch (e) {
      warn(`${code}: Wikipedia fetch failed (${wikiTitle}): ${e.message}`)
    }
    const labelFor = (year) => (results ? results.get(year) : undefined)

    const history = allYears.map((year) => {
      const host = hostByYear[year] || []
      const stats = byYear.get(year)
      const raw = labelFor(year)
      if (stats) {
        if (raw == null) warn(`${code}: played ${year} but no Wikipedia result`)
        // a recognised round code, else the cleaned raw label (e.g. an unusual round name)
        const finish = raw == null ? null : mapFinish(raw) || cleanLabel(raw)
        if (raw != null && mapReason(raw)) warn(`${code}: played ${year} but Wikipedia says "${raw}"`)
        return { year, host, played: true, finish, reason: null, ...stats }
      }
      // curated.teams[code].reasons fills the rare year Wikipedia's table omits entirely
      const override = curated.teams?.[code]?.reasons?.[year]
      if (raw == null && !override) warn(`${code}: missing ${year} (no matches, no Wikipedia row)`)
      const reason =
        raw != null ? mapReason(raw) || cleanReason(raw) : override ? mapReason(override) || override : null
      if (raw != null && mapFinish(raw)) warn(`${code}: ${year} not in CSV but Wikipedia says "${raw}"`)
      return { year, host, played: false, finish: null, reason, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }
    })

    const total = history.reduce(
      (t, h) => {
        if (!h.played) return t
        t.apps++
        t.p += h.p
        t.w += h.w
        t.d += h.d
        t.l += h.l
        t.gf += h.gf
        t.ga += h.ga
        if (h.finish === 'W') t.titles++
        t.best = betterFinish(t.best, h.finish)
        return t
      },
      { apps: 0, titles: 0, best: null, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 },
    )

    out[code] = { history, total }
    await sleep(700) // be gentle to Wikipedia
  }

  await fs.writeFile(OUT_PATH, `${JSON.stringify(out, null, 1)}\n`)
  const teams = Object.keys(out)
  console.log(`wrote ${path.relative(ROOT, OUT_PATH)} for ${teams.length} team(s): ${teams.join(', ')}`)
  for (const t of teams) {
    const h = out[t]
    const missedN = h.history.filter((r) => !r.played).length
    console.log(
      `  ${t}: ${h.total.apps} apps, ${h.total.titles} title(s), best ${h.total.best}; ${missedN} missed`,
    )
  }
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`)
    for (const w of warnings) console.log(`  ! ${w}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
