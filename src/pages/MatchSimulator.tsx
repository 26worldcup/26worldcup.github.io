import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useAppData, useData } from '../data/DataContext'
import { intifyKo, pairProbs, simulateMatch } from '../sim/engine'
import type { SimScore } from '../sim/engine'
import { dayCutoffMs, modelAt } from '../sim/history'
import { flagEmoji, hostSide } from '../utils/helpers'
import Flag from '../components/Flag'
import Icon from '../components/Icon'
import MatchCard from '../components/MatchCard'
import './matchsimulator.css'

interface KoProbs {
  h: number
  d: number
  a: number
  dr: number
}

interface SimEntry {
  id: number
  homeCode: string
  awayCode: string
  score: SimScore
  probs: KoProbs
  knockout: boolean
}

export default function MatchSimulator() {
  const { t, pick } = useI18n()
  const { teams, matches, venues } = useAppData()
  const { simModel, loadSimModel, simHistory, loadSimHistory } = useData()
  useEffect(() => {
    loadSimModel()
  })

  // every team with a known Elo rating, sorted by name for the pickers
  const teamCodes = useMemo(() => {
    if (!simModel) return []
    // pickers sorted by FIFA three-letter code (ARG, AUS, BRA, ...)
    return Object.keys(simModel.teams)
      .filter((c) => teams[c])
      .sort((a, b) => a.localeCompare(b))
  }, [simModel, teams])

  // '' = latest (sim-model.json); otherwise a local calendar day, and the ratings
  // are those in force at that day's 00:00, i.e. before any of its matches. Same
  // rule as Forecast's date mode, so both pages mean the same thing by a date.
  const [ratingDay, setRatingDay] = useState('')
  useEffect(() => {
    if (ratingDay) loadSimHistory()
  }, [ratingDay, loadSimHistory])

  const ratingDays = useMemo(() => {
    const days = new Set<string>()
    for (const m of matches) {
      const d = new Date(m.date)
      days.add(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      )
    }
    return [...days].sort()
  }, [matches])

  // null while the history file loads, so the Simulate button disables and the live
  // preview hides, rather than quietly showing today's ratings under a historical
  // label. The team pickers stay interactive; they read from simModel, not this.
  const activeModel = useMemo(() => {
    if (!ratingDay) return simModel
    if (!simHistory) return null
    return modelAt(simHistory, dayCutoffMs(ratingDay))
  }, [ratingDay, simHistory, simModel])

  const [homeCode, setHomeCode] = useState('')
  const [awayCode, setAwayCode] = useState('')
  // which side gets the host/home advantage: 'a' = Team A, 'b' = Team B, null = neutral
  const [homeSide, setHomeSide] = useState<'a' | 'b' | null>(null)
  // knockout: a 90' draw goes to extra time, then penalties (so there's always a winner)
  const [knockout, setKnockout] = useState(false)
  // optional ?a=XXX&b=YYY&home=a|b (e.g. a link from a match page) pre-selects the
  // matchup and which team is at home
  const [params] = useSearchParams()
  // default matchup: the next match still without a result (not yet played or finished),
  // by kickoff time; once the final is over, the final
  const defaultMatch = useMemo(() => {
    const next = matches
      .filter((m) => m.status !== 'finished' && m.home?.code && m.away?.code)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))[0]
    return next ?? matches.find((m) => m.stage === 'final' && m.home?.code && m.away?.code) ?? null
  }, [matches])
  // seed once the rating list is ready: URL params if valid, else the default match (its
  // home side derived from the venue), else the first two teams alphabetically (neutral)
  useEffect(() => {
    if (teamCodes.length < 2 || homeCode || awayCode) return
    const want = (c: string | null | undefined) => (c && teamCodes.includes(c) ? c : '')
    const asSide = (s: string | null) => (s === 'a' || s === 'b' ? s : null)
    const ua = want(params.get('a'))
    const ub = want(params.get('b'))
    if (ua && ub && ua !== ub) {
      setHomeCode(ua)
      setAwayCode(ub)
      setHomeSide(asSide(params.get('home')))
      setKnockout(params.get('knockout') === '1')
      return
    }
    const da = want(defaultMatch?.home?.code)
    const db = want(defaultMatch?.away?.code)
    if (da && db && da !== db) {
      setHomeCode(da)
      setAwayCode(db)
      setHomeSide(hostSide(da, db, venues[defaultMatch?.venueId ?? '']?.country))
      setKnockout(!!defaultMatch && defaultMatch.stage !== 'group')
      return
    }
    setHomeCode(teamCodes[0])
    setAwayCode(teamCodes[1])
  }, [teamCodes, homeCode, awayCode, params, defaultMatch, venues])

  const [result, setResult] = useState<SimEntry | null>(null)
  const [history, setHistory] = useState<SimEntry[]>([])
  const idRef = useRef(0)

  // which positional team the home edge favours ('home' = Team A); undefined = neutral
  const homeAdvantage: 'home' | 'away' | undefined =
    homeSide === 'a' ? 'home' : homeSide === 'b' ? 'away' : undefined
  const livePreview = useMemo(() => {
    if (!activeModel || !homeCode || !awayCode || homeCode === awayCode) return null
    return pairProbs(activeModel, homeCode, awayCode, undefined, homeAdvantage)
  }, [activeModel, homeCode, awayCode, homeAdvantage])

  // every real World Cup fixture between the two picked teams, either order, regardless of
  // the home-advantage / knockout toggles (they only affect the hypothetical simulation)
  const realMatches = useMemo(() => {
    if (!homeCode || !awayCode) return []
    return matches
      .filter(
        (m) =>
          (m.home?.code === homeCode && m.away?.code === awayCode) ||
          (m.home?.code === awayCode && m.away?.code === homeCode),
      )
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  }, [matches, homeCode, awayCode])

  const canSimulate = !!activeModel && !!homeCode && !!awayCode && homeCode !== awayCode

  const simulate = () => {
    if (!canSimulate || !activeModel) return
    const probs = pairProbs(activeModel, homeCode, awayCode, undefined, homeAdvantage)
    const score = simulateMatch(
      activeModel,
      homeCode,
      awayCode,
      undefined,
      knockout,
      Math.random,
      homeAdvantage,
    )
    const entry: SimEntry = {
      id: idRef.current++,
      homeCode,
      awayCode,
      score,
      probs: { h: probs.h, d: probs.d, a: probs.a, dr: probs.dr },
      knockout,
    }
    setResult(entry)
    setHistory((h) => [entry, ...h].slice(0, 8))
  }

  const swapTeams = () => {
    setHomeCode(awayCode)
    setAwayCode(homeCode)
    setHomeSide((s) => (s === 'a' ? 'b' : s === 'b' ? 'a' : null))
    setResult(null)
  }

  const teamLabel = (code: string) => pick(teams[code]?.name, code)

  // run a first simulation automatically once the matchup is seeded (from a match-page
  // link or the default next-match), so the page always lands on a result without a click
  const autoRan = useRef(false)
  const simulateRef = useRef(simulate)
  simulateRef.current = simulate
  useEffect(() => {
    if (autoRan.current || !canSimulate) return
    autoRan.current = true
    simulateRef.current()
  }, [canSimulate])

  return (
    <div>
      <div className="page-head">
        <div className="page-head-row">
          <h1>{t('aimsTitle')}</h1>
          <Link className="chip page-head-cta" to="/forecast">
            <Icon name="target" size={13} />
            {t('simTitle')}
          </Link>
        </div>
        <p>{t('aimsSub')}</p>
      </div>

      <section className="card card-pad ams-panel">
        <div className="ams-pickers">
          <div className="ams-picker">
            <label htmlFor="ams-home">{t('aimsTeamA')}</label>
            <select
              id="ams-home"
              className="input"
              value={homeCode}
              onChange={(e) => {
                setHomeCode(e.target.value)
                setResult(null)
              }}
            >
              {teamCodes.map((c) => (
                <option key={c} value={c} disabled={c === awayCode}>
                  {flagEmoji(teams[c]?.iso2)}
                  {teamLabel(c)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn ams-swap"
            onClick={swapTeams}
            disabled={!homeCode || !awayCode}
            aria-label={t('aimsSwap')}
            title={t('aimsSwap')}
          >
            <span aria-hidden="true">⇄</span>
          </button>

          <div className="ams-picker">
            <label htmlFor="ams-away">{t('aimsTeamB')}</label>
            <select
              id="ams-away"
              className="input"
              value={awayCode}
              onChange={(e) => {
                setAwayCode(e.target.value)
                setResult(null)
              }}
            >
              {teamCodes.map((c) => (
                <option key={c} value={c} disabled={c === homeCode}>
                  {flagEmoji(teams[c]?.iso2)}
                  {teamLabel(c)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="ams-home" role="radiogroup" aria-label={t('aimsHome')}>
          <span className="ams-home-label">{t('aimsHome')}</span>
          <label className="ams-home-opt">
            <input
              type="radio"
              name="ams-home-adv"
              checked={homeSide === null}
              onChange={() => {
                setHomeSide(null)
                setResult(null)
              }}
            />
            {t('aimsNeutral')}
          </label>
          <label className="ams-home-opt">
            <input
              type="radio"
              name="ams-home-adv"
              checked={homeSide === 'a'}
              onChange={() => {
                setHomeSide('a')
                setResult(null)
              }}
            />
            <Flag team={teams[homeCode]} size={16} />
            {teamLabel(homeCode)}
          </label>
          <label className="ams-home-opt">
            <input
              type="radio"
              name="ams-home-adv"
              checked={homeSide === 'b'}
              onChange={() => {
                setHomeSide('b')
                setResult(null)
              }}
            />
            <Flag team={teams[awayCode]} size={16} />
            {teamLabel(awayCode)}
          </label>
        </div>

        <div className="ams-controls">
          <label className="ams-ko">
            <input
              type="checkbox"
              checked={knockout}
              onChange={(e) => {
                setKnockout(e.target.checked)
                setResult(null)
              }}
            />
            {t('aimsKnockout')}
          </label>

          <label className="ams-ratings">
            {t('aimsRatings')}
            <select
              className="input"
              value={ratingDay}
              onChange={(e) => {
                setRatingDay(e.target.value)
                setResult(null)
              }}
            >
              <option value="">{t('aimsRatingsLatest')}</option>
              {ratingDays.map((d, i) => (
                <option key={d} value={d}>
                  {i === 0 ? t('aimsRatingsPre') : d}
                </option>
              ))}
            </select>
          </label>
        </div>

        {livePreview && !result && (
          <div className="ams-preview">
            <ProbBar home={teamLabel(homeCode)} away={teamLabel(awayCode)} probs={livePreview} compact />
            {knockout && (
              <KoProbTable home={teamLabel(homeCode)} away={teamLabel(awayCode)} p={livePreview} />
            )}
          </div>
        )}

        <button type="button" className="btn btn-primary ams-go" onClick={simulate} disabled={!canSimulate}>
          <Icon name="bolt" size={16} />
          {t('aimsSimulate')}
        </button>

        {result && <ResultCard entry={result} teamLabel={teamLabel} />}
      </section>

      {history.length > 0 && (
        <section className="ams-history-section">
          <div className="section-title">
            <h2>{t('aimsHistory')}</h2>
            <button type="button" className="more ams-clear" onClick={() => setHistory([])}>
              {t('aimsClearHistory')}
            </button>
          </div>
          <div className="ams-history">
            {history.map((h) => {
              const won = h.score.winner
              return (
                <div key={h.id} className="card card-pad ams-history-row">
                  <Flag team={teams[h.homeCode]} size={18} />
                  <span className={`ams-history-team${won === h.homeCode ? ' win' : ''}`}>
                    {teamLabel(h.homeCode)}
                  </span>
                  <span className="tnum ams-history-score">
                    <span className="ams-history-main">
                      {h.score.et ? `${h.score.et.h}–${h.score.et.a}` : `${h.score.h}–${h.score.a}`}
                      {h.score.et && <span className="ams-aet">{t('simAet')}</span>}
                    </span>
                    {h.score.et && (
                      <small className="ams-history-sub">
                        90′ {h.score.h}–{h.score.a}
                        {h.score.pens && ` · ${t('pens')} ${h.score.pens.h}–${h.score.pens.a}`}
                      </small>
                    )}
                  </span>
                  <span className={`ams-history-team away${won === h.awayCode ? ' win' : ''}`}>
                    {teamLabel(h.awayCode)}
                  </span>
                  <Flag team={teams[h.awayCode]} size={18} />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {realMatches.length > 0 && (
        <section className="ams-history-section">
          <div className="section-title">
            <h2>{t('aimsRealMatch')}</h2>
          </div>
          <div className="ams-real">
            {realMatches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      <p className="muted small ams-note">{t('aimsNote')}</p>
    </div>
  )
}

function ResultCard({ entry, teamLabel }: { entry: SimEntry; teamLabel: (code: string) => string }) {
  const { teams } = useAppData()
  const { t } = useI18n()
  const { homeCode, awayCode, score, probs, knockout } = entry
  // the engine sets `winner` accounting for extra time + penalties; '' means a 90' draw
  const winner = score.winner === homeCode ? homeCode : score.winner === awayCode ? awayCode : null

  return (
    <div className="ams-result">
      <GoalFlash key={entry.id} />
      <div className="ams-scoreboard">
        <div className={`ams-team${winner === homeCode ? ' win' : ''}`}>
          <Flag team={teams[homeCode]} size={36} />
          <span>{teamLabel(homeCode)}</span>
        </div>
        <div className="ams-score tnum">
          {score.et ? (
            <>
              {score.et.h} – {score.et.a}
              <span className="ams-aet">{t('simAet')}</span>
            </>
          ) : (
            <>
              {score.h} – {score.a}
            </>
          )}
        </div>
        <div className={`ams-team away${winner === awayCode ? ' win' : ''}`}>
          <span>{teamLabel(awayCode)}</span>
          <Flag team={teams[awayCode]} size={36} />
        </div>
      </div>
      {score.et && (
        <p className="ams-score-sub small muted tnum">
          90′ {score.h}–{score.a}
          {score.pens && (
            <>
              {' '}
              · {t('pens')} {score.pens.h}–{score.pens.a}
            </>
          )}
        </p>
      )}
      <p className="ams-result-label">
        {winner ? t('aimsWinner', { team: teamLabel(winner) }) : t('aimsDraw')}
      </p>
      <ProbBar home={teamLabel(homeCode)} away={teamLabel(awayCode)} probs={probs} />
      {knockout && <KoProbTable home={teamLabel(homeCode)} away={teamLabel(awayCode)} p={probs} />}
    </div>
  )
}

/** knockout-path probabilities: win in 90', in extra time, on penalties, and total
 *  advance per side — analytical, matching the match-page breakdown */
function KoProbTable({ home, away, p }: { home: string; away: string; p: KoProbs }) {
  const { t } = useI18n()
  // integer percentages rounded exactly like the pipeline (engine intifyKo), so this
  // table matches the knockout breakdown on the match pages
  const k = intifyKo(p)
  return (
    <table className="ams-kotable small tnum">
      <thead>
        <tr>
          <td />
          <th scope="col">{home}</th>
          <th scope="col">{away}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">{t('prob90')}</th>
          <td>{k.h.toFixed(1)}%</td>
          <td>{k.a.toFixed(1)}%</td>
        </tr>
        <tr>
          <th scope="row">{t('probEt')}</th>
          <td>+{k.eh.toFixed(1)}%</td>
          <td>+{k.ea.toFixed(1)}%</td>
        </tr>
        <tr>
          <th scope="row">{t('probPens')}</th>
          <td>+{k.ph.toFixed(1)}%</td>
          <td>+{k.pa.toFixed(1)}%</td>
        </tr>
        <tr className="ams-kotable-total">
          <th scope="row">{t('probAdvance')}</th>
          <td>{k.ah.toFixed(1)}%</td>
          <td>{(100 - k.ah).toFixed(1)}%</td>
        </tr>
      </tbody>
    </table>
  )
}

function ProbBar({
  home,
  away,
  probs,
  compact = false,
}: {
  home: string
  away: string
  probs: { h: number; d: number; a: number }
  compact?: boolean
}) {
  const { t } = useI18n()
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`
  return (
    <div className={`ams-probbar${compact ? ' compact' : ''}`}>
      {!compact && (
        <div className="ams-probbar-labels">
          <span>{home}</span>
          <span>{t('aimsDrawLabel')}</span>
          <span>{away}</span>
        </div>
      )}
      <div className="ams-probbar-track" aria-hidden="true">
        <span className="ams-seg h" style={{ width: pct(probs.h) }} />
        <span className="ams-seg d" style={{ width: pct(probs.d) }} />
        <span className="ams-seg a" style={{ width: pct(probs.a) }} />
      </div>
      <div className="ams-probbar-nums tnum">
        <span>{pct(probs.h)}</span>
        <span>{pct(probs.d)}</span>
        <span>{pct(probs.a)}</span>
      </div>
    </div>
  )
}

/** brief goal celebration: ball flying into the net, shown once per result */
function GoalFlash() {
  const { t } = useI18n()
  const [phase, setPhase] = useState<'start' | 'shoot' | 'text'>('start')

  useEffect(() => {
    // two rAFs let the browser paint the "start" position first, so the move to "shoot"
    // is guaranteed to animate. a fresh key per result remounts this, replaying in full.
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPhase('shoot'))
    })
    const textTimer = setTimeout(() => setPhase('text'), 1150)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      clearTimeout(textTimer)
    }
  }, [])

  return (
    <div className="ams-goalflash" aria-hidden="true">
      <span className={`ams-net${phase !== 'start' ? ' shake' : ''}`} />
      <span className={`ams-goalball ${phase === 'start' ? 'at-start' : 'at-net'}`}>⚽</span>
      <span className={`ams-goaltext${phase === 'text' ? ' show' : ''}`}>{t('aimsGoal')}</span>
    </div>
  )
}
