// Elo ratings + W/D/L probabilities from martj42/international_results (CC0).
// RATINGS: full replay since 1872 (Elo's recursive update is its own time decay;
// current ratings are dominated by recent results, as on eloratings.net).
// CALIBRATION: the dr -> outcome mapping is the empirical frequency in
// competitive internationals since 1990 (World Cup, continental cups,
// qualifiers, Nations League — friendlies excluded), favourite-mirrored,
// 50-pt bins with sparse tails merged. No logistic assumption.

export const RESULTS_URL =
  'https://raw.githubusercontent.com/martj42/international_results/master/results.csv'

const HOME_ADV = 100 // rating bonus for a non-neutral home side
const INIT = 1500

// K by tournament importance (eloratings.net scheme, condensed)
function kFor(tournament) {
  const t = tournament.toLowerCase()
  if (t === 'fifa world cup') return 60
  if (
    /copa améric|uefa euro(?!.*qual)|african cup of nations|afc asian cup|concacaf championship|gold cup|oceania nations cup|confederations cup/.test(
      t,
    ) &&
    !t.includes('qualification')
  ) {
    return 50
  }
  if (t.includes('qualification') || t.includes('nations league')) return 40
  return 20
}

// goal-margin multiplier
function gFor(margin) {
  const m = Math.abs(margin)
  if (m <= 1) return 1
  if (m === 2) return 1.5
  return (11 + m) / 8
}

const expected = (dr) => 1 / (1 + 10 ** (-dr / 400))

/** parse the dataset's simple CSV (no quoted commas in the columns we use) */
function parseCsv(text) {
  const rows = []
  for (const line of text.split('\n').slice(1)) {
    if (!line) continue
    const c = line.split(',')
    if (c.length < 9) continue
    const hs = Number(c[3])
    const as = Number(c[4])
    if (!Number.isFinite(hs) || !Number.isFinite(as)) continue
    rows.push({
      date: c[0],
      home: c[1],
      away: c[2],
      hs,
      as,
      tournament: c[5],
      neutral: c[8].trim().toUpperCase() === 'TRUE',
    })
  }
  return rows
}

// confederation of each dataset team name seen in cross-confederation play —
// used to fit systematic inter-confederation rating offsets
export const CONFED_LISTS = {
  UEFA: [
    'England',
    'Scotland',
    'Wales',
    'Northern Ireland',
    'Republic of Ireland',
    'France',
    'Germany',
    'Spain',
    'Portugal',
    'Italy',
    'Netherlands',
    'Belgium',
    'Croatia',
    'Serbia',
    'Switzerland',
    'Austria',
    'Denmark',
    'Sweden',
    'Norway',
    'Poland',
    'Czech Republic',
    'Slovakia',
    'Slovenia',
    'Hungary',
    'Romania',
    'Bulgaria',
    'Greece',
    'Turkey',
    'Russia',
    'Ukraine',
    'Bosnia and Herzegovina',
    'North Macedonia',
    'Albania',
    'Iceland',
    'Finland',
    'Israel',
    'Georgia',
    'Kosovo',
    'Montenegro',
  ],
  CONMEBOL: [
    'Brazil',
    'Argentina',
    'Uruguay',
    'Chile',
    'Colombia',
    'Peru',
    'Ecuador',
    'Paraguay',
    'Bolivia',
    'Venezuela',
  ],
  CONCACAF: [
    'Mexico',
    'United States',
    'Canada',
    'Costa Rica',
    'Honduras',
    'Panama',
    'Jamaica',
    'Trinidad and Tobago',
    'El Salvador',
    'Haiti',
    'Curaçao',
    'Guatemala',
    'Cuba',
  ],
  AFC: [
    'Japan',
    'South Korea',
    'Saudi Arabia',
    'Iran',
    'Iraq',
    'Qatar',
    'United Arab Emirates',
    'Australia',
    'China PR',
    'Uzbekistan',
    'Jordan',
    'Kuwait',
    'Bahrain',
    'Oman',
    'Syria',
    'Thailand',
    'Indonesia',
    'North Korea',
  ],
  CAF: [
    'Nigeria',
    'Ghana',
    'Senegal',
    'Cameroon',
    'Morocco',
    'Tunisia',
    'Algeria',
    'Egypt',
    'Ivory Coast',
    'South Africa',
    'Mali',
    'Burkina Faso',
    'DR Congo',
    'Cape Verde',
    'Guinea',
    'Zambia',
    'Togo',
    'Angola',
  ],
  OFC: ['New Zealand', 'Tahiti', 'Fiji', 'New Caledonia', 'Solomon Islands'],
}

export const DATASET_NAME = {
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

/** FIFA three-letter code -> confederation, derived from the two tables above */
export const CONFED_OF = (() => {
  const out = {}
  for (const [conf, names] of Object.entries(CONFED_LISTS)) {
    for (const [code, dsName] of Object.entries(DATASET_NAME)) {
      if (names.includes(dsName)) out[code] = conf
    }
  }
  return out
})()

const TEAM_CONFED = new Map()
for (const [conf, names] of Object.entries(CONFED_LISTS)) {
  for (const n of names) TEAM_CONFED.set(n, conf)
}

/**
 * Replay all matches. Returns { ratings: Map<name, elo>, drawCurve }.
 * drawCurve: empirical P(draw) by |adjusted elo diff|, 50-pt bins since 1990.
 */
export function replay(csvText, calibSince = '1990-01-01') {
  const rows = parseCsv(csvText)
  rows.sort((a, b) => (a.date < b.date ? -1 : 1))
  const ratings = new Map()
  const get = (t) => ratings.get(t) ?? INIT
  // empirical outcome by |adjusted dr|, favourite's perspective (mirrored data),
  // 50-pt bins since 1990 — calibrates away the logistic tail over-confidence
  const bins = [] // {n, favWins, draws} — all competitive (prior)
  const wcBins = [] // World Cup finals only (the exact context)
  const cross = [] // cross-confederation matches for offset fitting
  for (const r of rows) {
    const ra = get(r.home)
    const rb = get(r.away)
    const dr = ra - rb + (r.neutral ? 0 : HOME_ADV)
    // calibrate on competitive matches since 1990 (WC, continental cups,
    // qualifiers, Nations League) — friendlies' rotation noise excluded
    const competitive = kFor(r.tournament) >= 40
    if (r.date >= calibSince && competitive) {
      const bin = Math.min(Math.floor(Math.abs(dr) / 50), 12)
      const rec = (arr) => {
        arr[bin] ??= { n: 0, favWins: 0, draws: 0 }
        arr[bin].n++
        if (r.hs === r.as) arr[bin].draws++
        else if (r.hs > r.as === dr >= 0) arr[bin].favWins++
      }
      rec(bins)
      if (r.tournament.toLowerCase() === 'fifa world cup') rec(wcBins)
    }
    if (r.date >= '2002-01-01' && competitive) {
      const ch = TEAM_CONFED.get(r.home)
      const ca = TEAM_CONFED.get(r.away)
      if (ch && ca && ch !== ca) {
        cross.push({ ch, ca, dr, score: r.hs > r.as ? 1 : r.hs === r.as ? 0.5 : 0 })
      }
    }
    const we = expected(dr)
    const score = r.hs > r.as ? 1 : r.hs === r.as ? 0.5 : 0
    const delta = kFor(r.tournament) * gFor(r.hs - r.as) * (score - we)
    ratings.set(r.home, ra + delta)
    ratings.set(r.away, rb - delta)
  }
  // merge sparse tail bins into their predecessor for stability
  for (let i = bins.length - 1; i > 0; i--) {
    if (bins[i] && bins[i].n < 200) {
      bins[i - 1] ??= { n: 0, favWins: 0, draws: 0 }
      bins[i - 1].n += bins[i].n
      bins[i - 1].favWins += bins[i].favWins
      bins[i - 1].draws += bins[i].draws
      bins.length = i
    }
  }
  // World-Cup-context shrinkage: blend each bin toward the WC-finals evidence
  const PRIOR = 30
  const outcomeCurve = bins.map((b, i) => {
    const pw = b.favWins / b.n
    const pd = b.draws / b.n
    const wc = wcBins[i]
    if (!wc) return { w: pw, d: pd }
    return {
      w: (wc.favWins + PRIOR * pw) / (wc.n + PRIOR),
      d: (wc.draws + PRIOR * pd) / (wc.n + PRIOR),
    }
  })

  // inter-confederation offsets: gradient fit of expected(dr + oH - oA) over the
  // cross-confederation sample, mean-zero — corrects each confederation's
  // internal inflation when rating bubbles meet (as they do at a World Cup)
  const offsets = { UEFA: 0, CONMEBOL: 0, CONCACAF: 0, AFC: 0, CAF: 0, OFC: 0 }
  const LR = 30
  for (let iter = 0; iter < 400; iter++) {
    const grad = { UEFA: 0, CONMEBOL: 0, CONCACAF: 0, AFC: 0, CAF: 0, OFC: 0 }
    for (const m of cross) {
      const err = expected(m.dr + offsets[m.ch] - offsets[m.ca]) - m.score
      grad[m.ch] += err
      grad[m.ca] -= err
    }
    for (const c of Object.keys(offsets)) offsets[c] -= (LR * grad[c]) / cross.length
    const mean = Object.values(offsets).reduce((a, b) => a + b, 0) / 6
    for (const c of Object.keys(offsets)) offsets[c] -= mean
  }
  return { ratings, outcomeCurve, offsets, matchesReplayed: rows.length, crossSample: cross.length }
}

/** favourite's empirical {w,d} for an |adjusted dr|: bins live at their centres
 * (25, 75, ...) and dr=0 is anchored symmetric so tiny favourites get tiny edges */
function favOutcome(outcomeCurve, absDr) {
  const pts = [{ x: 0, w: (1 - outcomeCurve[0].d) / 2, d: outcomeCurve[0].d }].concat(
    outcomeCurve.map((b, i) => ({ x: (i + 0.5) * 50, ...b })),
  )
  const xi = Math.min(absDr, pts[pts.length - 1].x)
  let i = 0
  while (i < pts.length - 2 && pts[i + 1].x < xi) i++
  const a = pts[i]
  const b = pts[i + 1]
  const f = (xi - a.x) / (b.x - a.x)
  return { w: a.w * (1 - f) + b.w * f, d: a.d * (1 - f) + b.d * f }
}

/** raw float {h,d,a,tilt} for one fixture (tilt = extra-time edge for knockout) */
export function rawProbs(drIn, outcomeCurve) {
  const dr = drIn
  const { w, d: d0 } = favOutcome(outcomeCurve, Math.abs(dr))
  const favWin = Math.max(w, 0.05)
  const d = Math.min(Math.max(d0, 0.05), 0.35)
  const favLoss = Math.max(1 - favWin - d, 0.02)
  const [h, a] = dr >= 0 ? [favWin, favLoss] : [favLoss, favWin]
  const sum = h + d + a
  return { h: h / sum, d: d / sum, a: a / sum, dr, tilt: Math.min(Math.max(0.5 + dr / 4000, 0.38), 0.62) }
}

/** decompose the 90' draw mass over the knockout path: extra-time wins per
 * side + the penalty shoot-out. Mirrors the client engine's ET model
 * (Poisson per side, lambda = 0.85 x logistic strength share, floor 0.12);
 * the shoot-out itself is symmetric. Returns floats summing to p.d. */
export function koBreakdown(p) {
  const dr = p.dr ?? (p.tilt - 0.5) * 4000
  const share = 1 / (1 + 10 ** (-dr / 400))
  const lh = Math.max(0.85 * share, 0.12)
  const la = Math.max(0.85 * (1 - share), 0.12)
  const fact = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800]
  const pois = (l, k) => (Math.exp(-l) * l ** k) / fact[k]
  let tie = 0
  let hw = 0
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const pr = pois(lh, i) * pois(la, j)
      if (i === j) tie += pr
      else if (i > j) hw += pr
    }
  }
  return { eh: p.d * hw, ea: p.d * (1 - tie - hw), ph: (p.d * tie) / 2, pa: (p.d * tie) / 2 }
}

/** round raw float probs to one-decimal percentages for display. each cell is the
 * honest round of its own value (no largest-remainder redistribution, so equal
 * probabilities render equally and nothing is nudged to force a running total); the
 * knockout advance % is the exact float, rounded once. h/d/a may therefore total
 * 99.9-100.1, and the ET/penalty cells need not add up to the rounded advance %. */
export function intify(p, knockout) {
  const r1 = (v) => Math.round(v * 1000) / 10 // probability in [0,1] -> one-decimal percent
  const out = { h: r1(p.h), d: r1(p.d), a: r1(p.a) }
  if (knockout) {
    const bd = koBreakdown(p)
    out.eh = r1(bd.eh)
    out.ea = r1(bd.ea)
    out.ph = r1(bd.ph)
    out.pa = r1(bd.pa)
    out.ah = r1(p.h + bd.eh + bd.ph)
  }
  return out
}

/** equal-weight ensemble of two raw prob estimates */
export function blend(p1, p2) {
  if (!p2) return p1
  return {
    h: (p1.h + p2.h) / 2,
    d: (p1.d + p2.d) / 2,
    a: (p1.a + p2.a) / 2,
    dr: (p1.dr + p2.dr) / 2,
    tilt: (p1.tilt + p2.tilt) / 2,
  }
}

/** convenience: integer probs straight from one elo pair (kept for tests) */
export function fixtureProbs(eloH, eloA, homeBonus, outcomeCurve, knockout) {
  return intify(rawProbs(eloH - eloA + homeBonus, outcomeCurve), knockout)
}
