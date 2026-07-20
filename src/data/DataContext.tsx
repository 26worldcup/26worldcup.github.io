import { createContext, useContext, useEffect, useRef, useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { AppData, Squads, WcHistory } from '../types'
import type { SimModel } from '../sim/engine'
import type { SimHistory } from '../sim/history'
import { withResolvedSides } from '../utils/bracketResolve'

interface DataCtx {
  data: AppData | null
  error: string | null
  /** squads are loaded lazily on first use */
  squads: Squads | null
  loadSquads: () => void
  simModel: SimModel | null
  loadSimModel: () => void
  /** per-cut-point rating snapshots, loaded only when a time selector is used */
  simHistory: SimHistory | null
  loadSimHistory: () => void
  /** frozen World Cup history + qualification, loaded lazily on first use */
  wcHistory: WcHistory | null
  loadWcHistory: () => void
}

const Ctx = createContext<DataCtx | null>(null)

const BASE = `${import.meta.env.BASE_URL}data/`

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(BASE + file, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
  return res.json()
}

// degraded-mode fallbacks for the optional files (matches/teams/venues stay required)
const EMPTY_STANDINGS: AppData['standings'] = { groups: {}, thirds: [], complete: {} }
const EMPTY_STATS: AppData['stats'] = { scorers: [] }
const EMPTY_META: AppData['meta'] = { updatedAt: '', season: '', counts: {}, errors: [], sources: [] }

function settled<T>(r: PromiseSettledResult<T>, fallback: T): T {
  return r.status === 'fulfilled' ? r.value : fallback
}

// semi-live refresh: the data pipeline regenerates every ~15 min during matches
const REFRESH_EVERY = 5 * 60e3
const HIDDEN_REFRESH_AFTER = 2 * 60e3
// a match is plausibly in progress within [kickoff - 15 min, kickoff + 200 min]
const PRE_KICKOFF = 15 * 60e3
const POST_KICKOFF = 200 * 60e3

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [squads, setSquads] = useState<Squads | null>(null)
  const [simModel, setSimModel] = useState<SimModel | null>(null)
  const [simHistory, setSimHistory] = useState<SimHistory | null>(null)
  const [wcHistory, setWcHistory] = useState<WcHistory | null>(null)
  const simRequested = useRef(false)
  const simHistoryRequested = useRef(false)
  const squadsRequested = useRef(false)
  const wcHistoryRequested = useRef(false)
  const dataRef = useRef<AppData | null>(null)
  const refreshing = useRef(false)

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    let on = true
    Promise.allSettled([
      getJson<{ matches: AppData['matches'] }>('matches.json'),
      getJson<{ teams: AppData['teams'] }>('teams.json'),
      getJson<{ venues: AppData['venues'] }>('venues.json'),
      getJson<AppData['standings']>('standings.json'),
      getJson<AppData['weather']>('weather.json'),
      getJson<AppData['lineups']>('lineups.json'),
      getJson<AppData['stats']>('stats.json'),
      getJson<AppData['probs']>('probs.json'),
      getJson<AppData['meta']>('meta.json'),
      getJson<NonNullable<AppData['broadcasters']>>('broadcasters.json'),
    ]).then(([m, t, v, standings, weather, lineups, stats, probs, meta, broadcasters]) => {
      if (!on) return
      // matches/teams/venues are required: without them nothing can render
      if (m.status !== 'fulfilled' || t.status !== 'fulfilled' || v.status !== 'fulfilled') {
        const reasons = [m, t, v].flatMap((r) => (r.status === 'rejected' ? [String(r.reason)] : []))
        setError(reasons.join('; ') || 'load failed')
        return
      }
      // everything else degrades to an empty structure so one transient 404
      // (e.g. a file briefly missing mid-deploy) cannot blank the whole app
      setData({
        matches: m.value.matches,
        teams: t.value.teams,
        venues: v.value.venues,
        standings: settled(standings, EMPTY_STANDINGS),
        weather: settled(weather, {}),
        lineups: settled(lineups, {}),
        stats: settled(stats, EMPTY_STATS),
        probs: settled(probs, {}),
        meta: settled(meta, EMPTY_META),
        broadcasters: settled(broadcasters, null),
      })
    })
    return () => {
      on = false
    }
  }, [])

  // silent refresh of the volatile files while matches are (plausibly) running;
  // teams/venues are static for the whole tournament and are never refetched
  useEffect(() => {
    const refresh = async () => {
      if (refreshing.current || !dataRef.current) return
      refreshing.current = true
      try {
        const [m, standings, lineups, stats, probs, weather, meta] = await Promise.allSettled([
          getJson<{ matches: AppData['matches'] }>('matches.json'),
          getJson<AppData['standings']>('standings.json'),
          getJson<AppData['lineups']>('lineups.json'),
          getJson<AppData['stats']>('stats.json'),
          getJson<AppData['probs']>('probs.json'),
          getJson<AppData['weather']>('weather.json'),
          getJson<AppData['meta']>('meta.json'),
        ])
        setData((prev) =>
          prev
            ? {
                ...prev,
                matches: m.status === 'fulfilled' ? m.value.matches : prev.matches,
                standings: settled(standings, prev.standings),
                lineups: settled(lineups, prev.lineups),
                stats: settled(stats, prev.stats),
                probs: settled(probs, prev.probs),
                weather: settled(weather, prev.weather),
                meta: settled(meta, prev.meta),
              }
            : prev,
        )
      } finally {
        refreshing.current = false
      }
    }
    const matchInProgress = () => {
      const matches = dataRef.current?.matches
      if (!matches) return false
      const now = Date.now()
      return matches.some((m) => {
        if (m.status === 'live') return true
        const ko = Date.parse(m.date)
        return Number.isFinite(ko) && now >= ko - PRE_KICKOFF && now <= ko + POST_KICKOFF
      })
    }
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && matchInProgress()) void refresh()
    }, REFRESH_EVERY)
    let hiddenAt: number | null = null
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
      } else {
        if (hiddenAt !== null && Date.now() - hiddenAt > HIDDEN_REFRESH_AFTER) void refresh()
        hiddenAt = null
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const loadSquads = () => {
    if (squadsRequested.current) return
    squadsRequested.current = true
    getJson<Squads>('squads.json')
      .then(setSquads)
      .catch(() => {
        // transient failure: degrade for now but let a later visit retry
        squadsRequested.current = false
        setSquads((s) => s ?? {})
      })
  }

  const loadSimModel = () => {
    if (simRequested.current) return
    simRequested.current = true
    getJson<SimModel>('sim-model.json')
      .then(setSimModel)
      .catch(() => {
        simRequested.current = false
      })
  }

  const loadSimHistory = () => {
    if (simHistoryRequested.current) return
    simHistoryRequested.current = true
    getJson<SimHistory>('sim-model-history.json')
      .then(setSimHistory)
      .catch(() => {
        // transient failure: let a later interaction retry
        simHistoryRequested.current = false
      })
  }

  const loadWcHistory = () => {
    if (wcHistoryRequested.current) return
    wcHistoryRequested.current = true
    getJson<WcHistory>('wc-history.json')
      .then(setWcHistory)
      .catch(() => {
        // transient failure: degrade for now but let a later visit retry
        wcHistoryRequested.current = false
        setWcHistory((h) => h ?? {})
      })
  }

  // knockout slots that are mathematically decided render as real teams everywhere
  const dataResolved = useMemo(
    () => (data ? { ...data, matches: withResolvedSides(data.matches, data.standings) } : data),
    [data],
  )

  return (
    <Ctx.Provider
      value={{
        data: dataResolved,
        error,
        squads,
        loadSquads,
        simModel,
        loadSimModel,
        simHistory,
        loadSimHistory,
        wcHistory,
        loadWcHistory,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useData(): DataCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useData outside DataProvider')
  return ctx
}

/** convenience: non-null data accessor for pages rendered after the loading gate */
export function useAppData(): AppData {
  const { data } = useData()
  if (!data) throw new Error('data not loaded yet')
  return data
}
