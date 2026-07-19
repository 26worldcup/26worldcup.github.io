// Data contracts for public/data/*.json produced by scripts/update.mjs

export type Lang =
  | 'en'
  | 'fr'
  | 'es'
  | 'pt'
  | 'pt-BR'
  | 'de'
  | 'nl'
  | 'cs'
  | 'hr'
  | 'sv'
  | 'no'
  | 'ar'
  | 'fa'
  | 'tr'
  | 'uz'
  | 'ja'
  | 'ko'
  | 'zh'
  | 'zh-TW'
  | 'it'
  | 'id'
  | 'ru'
  | 'uk'

export type LocalizedName = Partial<Record<Lang, string | null>>

export type Stage = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final'

export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed'

export interface MatchSide {
  code: string
  score: number | null
  pen: number | null
}

export interface Official {
  id: string
  country: string | null
  role: string // 'referee' | 'ar1' | 'ar2' | 'fourth' | 'var' | 'avar' | ...
  name: LocalizedName
  typeName: LocalizedName // FIFA's localized role label, authoritative
}

export interface Match {
  id: string
  n: number
  stage: Stage
  group: string | null
  date: string // UTC ISO
  venueId: string | null
  status: MatchStatus
  time: string | null
  home: MatchSide | null
  away: MatchSide | null
  phA: string | null // placeholder like 'A1', '2B', 'W73', '3ABCDF'
  phB: string | null
  winner: string | null
  attendance: number | null
  officials: Official[]
}

export interface BaseCamp {
  city: string | null
  facility?: string | null
  country?: string | null
  lat?: number
  lon?: number
}

export interface Team {
  code: string
  fifaId: string | null
  group: string
  name: LocalizedName
  iso2: string | null
  ranking: number | null
  rankingPrev: number | null
  baseCamp: BaseCamp | null
  colors: string[]
  nickname: string | null
  web: string | null
  flag: string
}

export interface VenueClimate {
  jun?: { highC: number; lowC: number }
  jul?: { highC: number; lowC: number }
  rainNote?: string | LocalizedName | null
  roof?: string | null
}

export interface Venue {
  id: string
  realName: string
  city: string
  country: 'US' | 'CA' | 'MX'
  lat: number
  lon: number
  tz: string
  capacity: number
  roof: 'open' | 'canopy' | 'retractable' | 'fixed'
  note: string | null
  wiki: { title: string; url: string } | null
  fifaName: LocalizedName | null
  cityName: LocalizedName | null
  climate: VenueClimate | null
  matches: string[]
}

export interface StandingRow {
  code: string
  p: number
  w: number
  d: number
  l: number
  gf: number
  ga: number
  gd: number
  pts: number
  rank: number
  /** set while a group is still in progress when the team has mathematically
   * clinched a knockout place (locked top-2, or a guaranteed top-8 third) */
  clinched?: boolean
}

export interface ThirdRow extends StandingRow {
  group: string
  thirdRank: number
  qualifies: boolean | null
}

export interface Standings {
  groups: Record<string, StandingRow[]>
  thirds: ThirdRow[]
  complete: Record<string, boolean>
}

export interface LineupPlayer {
  id: string
  name: string | null
  number: number | null
  captain: boolean
  gk: boolean
  start: boolean
  fieldPos: number | null
  x: number | null
  y: number | null
}

export interface TeamLineup {
  tactics: string | null
  xi: LineupPlayer[]
  subs: LineupPlayer[]
  goals: {
    player: string
    minute: string | null
    /** elapsed seconds within the goal's period (from the FIFA timeline); orders same-minute goals */
    sec?: number
    type: number | null
    period: number | null
  }[]
  /** FIFA timeline assists, credited to this side's players (never own goals or penalties) */
  assists?: { player: string; minute: string | null; period: number | null }[]
  bookings: {
    /** null when the card went to a coach/team official rather than a player */
    player: string | null
    /** IdCoach/IdStaff of the booked team official; absent for player cards */
    official?: string
    minute: string | null
    card: number | null
    period: number | null
  }[]
  substitutions?: { off: string; on: string; minute: string | null; period: number | null }[]
}

export interface MatchLineups {
  home: TeamLineup | null
  away: TeamLineup | null
  matchTime: string | null
  period: number | null
  final: boolean
}

export interface WeatherInfo {
  tC: number
  feelsC: number
  pp: number | null
  code: number
  windKmh: number
  rh: number
  fetchedAt: string
}

export type PosBucket = 'GK' | 'DF' | 'MF' | 'FW'

export interface SquadPlayer {
  id: string
  no: number | null
  pos: PosBucket
  name: string
  dob: string | null
  caps: number | null // national-team career appearances
  goals: number | null // national-team career goals
  wcApps?: number // appearances in this World Cup
  wcGoals?: number // goals in this World Cup
  wcYellow?: number // yellow cards in this World Cup
  wcRed?: number // red cards in this World Cup (incl. second yellow)
  club: string | null
  clubNat: string | null
  clubWiki?: string | null // club's English Wikipedia article URL
  captain: boolean
  wiki: string | null // English Wikipedia article URL
}

export interface TeamSquad {
  coach: string | null
  coachWiki?: string | null // coach's English Wikipedia article URL
  wiki: { title: string; url: string } | null
  players: SquadPlayer[]
}

export interface BroadcastChannel {
  name: string
  type: 'tv' | 'streaming' | 'tv+streaming'
  free: boolean
  lang: string | null
  note: string | LocalizedName | null
}

export interface BroadcastMarket {
  iso2: string
  channels: BroadcastChannel[]
  source: string | null
}

export interface Broadcasters {
  markets: BroadcastMarket[]
  asOf?: string
}

// win/advance probabilities as one-decimal percentages (0-100); each cell is rounded
// independently, so h/d/a need not total exactly 100 nor the ET/pen cells the advance %
export interface MatchProbs {
  h: number
  d: number
  a: number
  ah?: number // knockout: advance incl. ET + pens
  eh?: number // knockout path: win in extra time (home/away)
  ea?: number
  ph?: number // knockout path: win on penalties (home/away)
  pa?: number
}

// one player's tournament tallies. The three leaderboards below are each the top 40
// of the same record type, so a row always shows all three numbers whichever tab is on
export interface PlayerTally {
  id: string
  name: string
  code: string
  no?: number
  goals: number
  assists: number
  ownGoals: number
  mins: number
}

export interface Stats {
  scorers: PlayerTally[]
  assisters?: PlayerTally[]
  minutes?: PlayerTally[]
  cards?: {
    yellow: number
    red: number
    players: { id: string; name: string; code: string; no?: number; y: number; r: number }[]
  }
  attAvg?: number | null
  biggestWin?: { diff: number; id?: string; h: string; a: string; hs: number; as: number } | null
  fastestGoal?: {
    min: number
    sec?: number // elapsed seconds (within the first half) for an exact M:SS, when known
    minute: string
    name: string
    code: string | null
    id?: string
  } | null
  // p = the favourite's pre-match win/advance %; bits = surprise (log2 pFav/pActual)
  upset?: { p: number; bits?: number; id: string; h: string; a: string; hs: number; as: number } | null
  suspensions?: Record<
    string,
    { id: string; name: string; bans: { type: 'red' | 'yellows'; due: string[]; banned: string | null }[] }[]
  >
  // team conduct ("fair play") score per team (0 best, negative = card deductions),
  // for group-stage matches and for all matches
  fairPlay?: { group: Record<string, number>; all: Record<string, number> }
}

export interface Meta {
  updatedAt: string
  season: string
  titleOdds?: { c: string; p: number }[]
  counts: Record<string, number>
  errors: string[]
  sources: string[]
}

export interface AppData {
  meta: Meta
  matches: Match[]
  teams: Record<string, Team>
  venues: Record<string, Venue>
  standings: Standings
  weather: Record<string, WeatherInfo>
  lineups: Record<string, MatchLineups>
  stats: Stats
  probs: Record<string, MatchProbs>
  broadcasters: Broadcasters | null
}

export type Squads = Record<string, TeamSquad>

// ---- World Cup history & 2026 qualification ----
// Frozen, one-time data in public/data/wc-history.json (generated by
// scripts/gen-wc-history.mjs from results.csv + curated labels). NOT refreshed by
// the update pipeline. Only carries teams that have been curated.

/** a country reference: ISO2 (for flag + Intl name) plus an English fallback name */
export interface PlaceRef {
  iso: string | null
  name: string | null
  /** explicit flag asset path overriding the ISO2 default (e.g. a historical flag) */
  flag?: string | null
  /** false = show `name` verbatim instead of localizing via ISO2 (defunct countries) */
  loc?: boolean
}

export interface WcHistoryRow {
  year: number
  host: PlaceRef[]
  /** whether the team took part in this tournament */
  played: boolean
  /** round reached when played: W RU 3 4 SF QF R16 R32 R2(second group round) GS */
  finish: string | null
  /** why the team was absent (when not played): dnq withdrew dne banned */
  reason: string | null
  p: number
  w: number
  d: number
  l: number
  gf: number
  ga: number
}

export interface WcHistoryTotal {
  apps: number
  titles: number
  best: string | null
  p: number
  w: number
  d: number
  l: number
  gf: number
  ga: number
}

export interface TeamWcHistory {
  history: WcHistoryRow[]
  total: WcHistoryTotal
}

export type WcHistory = Record<string, TeamWcHistory>

// ---- settings ----

export type TzMode = 'local' | 'venue' | 'fixed'

export type Theme = 'auto' | 'light' | 'dark'

export type Units = 'metric' | 'imperial'

export interface Settings {
  lang: Lang
  tzMode: TzMode
  fixedTz: string
  favorites: string[] // team codes; empty = all teams
  theme: Theme
  market: string | null // ISO2 country for TV channels; null = auto-detect
  units: Units // °C+km/h vs °F+mph
}
