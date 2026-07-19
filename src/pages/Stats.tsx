import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useAppData } from '../data/DataContext'
import { fmtCalendarDate } from '../utils/time'
import type { PlayerTally } from '../types'
import TeamName from '../components/TeamName'
import Flag from '../components/Flag'
import './stats.css'

// official FIFA ranking the app freezes to (see scripts/curated/fifa-ranking.json)
const RANKING_DATE = '2026-06-11'

export default function Stats() {
  const { t, locale } = useI18n()
  const { matches, teams, stats } = useAppData()

  // deep links from the group-stage tie-breaking criteria: ?ranking=1 / ?fairplay=1
  // scroll to the matching section and flash it once
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const target = searchParams.get('ranking')
      ? 'sx-fifa-ranking'
      : searchParams.get('fairplay')
        ? 'sx-fair-play'
        : null
    if (!target) return
    const el = document.getElementById(target)
    if (!el) return
    const id = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el.classList.add('flash')
      setTimeout(() => el.classList.remove('flash'), 1800)
    })
    return () => cancelAnimationFrame(id)
  }, [searchParams])

  // which of the three player leaderboards the tab strip has selected
  const [boardMode, setBoardMode] = useState<'goals' | 'assists' | 'mins'>('goals')

  // fair-play (team conduct) score table: group-stage by default, toggleable to all.
  // once the group stage is over and the first knockout match has finished, the
  // group-only table is stale, so default the toggle to the cumulative "all" view
  const groupMatches = matches.filter((m) => m.stage === 'group')
  const groupStageOver =
    groupMatches.length > 0 && groupMatches.every((m) => m.status === 'finished' || m.status === 'postponed')
  const firstKnockoutDone = matches.some((m) => m.stage !== 'group' && m.status === 'finished')
  const [fpMode, setFpMode] = useState<'group' | 'all' | 'allPerMatch'>(
    groupStageOver && firstKnockoutDone ? 'all' : 'group',
  )
  // matches each team has actually played (finished), for the per-match average
  const played: Record<string, number> = {}
  for (const m of matches) {
    if (m.status !== 'finished') continue
    if (m.home?.code) played[m.home.code] = (played[m.home.code] ?? 0) + 1
    if (m.away?.code) played[m.away.code] = (played[m.away.code] ?? 0) + 1
  }
  const allScores = stats.fairPlay?.all ?? {}
  // 'allPerMatch' = the cumulative "all" score divided by matches played (0 before any)
  const fpScores: Record<string, number> =
    fpMode === 'allPerMatch'
      ? Object.fromEntries(Object.keys(allScores).map((c) => [c, played[c] ? allScores[c] / played[c] : 0]))
      : (stats.fairPlay?.[fpMode] ?? {})
  // fewest deductions first (score closest to 0); worst-behaved teams last.
  // ties: in the "All" view, more matches played (a milder per-match average) ranks
  // first; group-stage and per-match views fall through to the FIFA code. Only the
  // score / among-equal ordering is reversed here; the code tiebreak stays alphabetical
  const fairPlayRows = Object.values(teams)
    .map((tm) => ({ code: tm.code, group: tm.group, score: fpScores[tm.code] ?? 0 }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (fpMode === 'all' ? (played[b.code] ?? 0) - (played[a.code] ?? 0) : 0) ||
        a.code.localeCompare(b.code),
    )

  const finished = matches.filter((m) => m.status === 'finished')
  const live = matches.filter((m) => m.status === 'live')
  const liveCount = live.length
  const goals = finished.reduce((sum, m) => sum + (m.home?.score ?? 0) + (m.away?.score ?? 0), 0)
  // average goals per finished match, 1 decimal, Latin digits in every locale
  const goalsAvg = finished.length > 0 ? (goals / finished.length).toFixed(2) : null

  // player leaderboard: three independent top-40 lists sharing one row shape, so every
  // row shows all three numbers whichever tab is on. Ranking follows the adidas Golden
  // Boot order (goals, then assists, then FEWER minutes played) on the goals board; the
  // other two lead with their own column and fall through to the same criteria.
  const boardRows =
    boardMode === 'assists'
      ? (stats.assisters ?? [])
      : boardMode === 'mins'
        ? (stats.minutes ?? [])
        : stats.scorers
  // sort key as a tuple (negated where bigger is better); two players share a rank only
  // when every criterion matches, so equal goals but fewer assists still ranks lower
  const sortKey = (p: PlayerTally) =>
    boardMode === 'assists'
      ? [-p.assists, -p.goals, p.mins]
      : boardMode === 'mins'
        ? [-p.mins, -p.goals, -p.assists]
        : [-p.goals, -p.assists, p.mins]
  const sorted = boardRows.slice().sort((a, b) => {
    const ka = sortKey(a)
    const kb = sortKey(b)
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]
    return a.name.localeCompare(b.name)
  })
  let prevKey: number[] | null = null
  let prevRank = 0
  const rankedPlayers = sorted.map((p, i) => {
    const key = sortKey(p)
    const rank = prevKey && key.every((v, j) => v === prevKey![j]) ? prevRank : i + 1
    prevKey = key
    prevRank = rank
    return { ...p, rank }
  })

  // all 48 teams by FIFA ranking, unranked last
  const ranked = Object.values(teams)
    .slice()
    .sort(
      (a, b) =>
        (a.ranking ?? Number.MAX_SAFE_INTEGER) - (b.ranking ?? Number.MAX_SAFE_INTEGER) ||
        a.code.localeCompare(b.code),
    )

  return (
    <div>
      <div className="page-head">
        <h1>{t('statsTitle')}</h1>
      </div>

      <div className="sx-summary">
        <div className="card sx-stat">
          <div className="sx-num tnum">{finished.length}</div>
          <div className="sx-lbl">{t('matchesPlayed')}</div>
        </div>
        <div className="card sx-stat">
          <div className="sx-num tnum">{goals}</div>
          <div className="sx-lbl">{t('statGoals')}</div>
        </div>
        {goalsAvg !== null && (
          <div className="card sx-stat">
            <div className="sx-num tnum">{goalsAvg}</div>
            <div className="sx-lbl">{t('statGoalsAvg')}</div>
          </div>
        )}
        {(stats.cards?.yellow ?? 0) > 0 && (
          <div className="card sx-stat">
            <div className="sx-num tnum">🟨 {stats.cards?.yellow}</div>
            <div className="sx-lbl">{t('statYellowCards')}</div>
          </div>
        )}
        {(stats.cards?.red ?? 0) > 0 && (
          <div className="card sx-stat">
            <div className="sx-num tnum">🟥 {stats.cards?.red}</div>
            <div className="sx-lbl">{t('statRedCards')}</div>
          </div>
        )}
        {stats.biggestWin && (
          <Link
            to={stats.biggestWin.id ? `/match/${stats.biggestWin.id}` : '/'}
            className="card sx-stat sx-stat-link"
          >
            <div className="sx-num tnum sx-num-sm">
              <Flag team={teams[stats.biggestWin.h]} size={22} /> {stats.biggestWin.hs}–{stats.biggestWin.as}{' '}
              <Flag team={teams[stats.biggestWin.a]} size={22} />
            </div>
            <div className="sx-lbl">{t('statBiggestWin')}</div>
          </Link>
        )}
        {stats.fastestGoal && (
          <Link
            to={stats.fastestGoal.id ? `/match/${stats.fastestGoal.id}` : '/'}
            className="card sx-stat sx-stat-link"
          >
            <div className="sx-num tnum sx-num-sm">
              {stats.fastestGoal.sec != null
                ? `${Math.floor(stats.fastestGoal.sec / 60)}:${String(stats.fastestGoal.sec % 60).padStart(2, '0')}`
                : stats.fastestGoal.minute}{' '}
              {stats.fastestGoal.name}
            </div>
            <div className="sx-lbl">{t('statFastestGoal')}</div>
          </Link>
        )}
        {stats.upset && (
          <Link to={`/match/${stats.upset.id}`} className="card sx-stat sx-stat-link">
            <div className="sx-num tnum sx-num-sm">
              <Flag team={teams[stats.upset.h]} size={22} /> {stats.upset.hs}–{stats.upset.as}{' '}
              <Flag team={teams[stats.upset.a]} size={22} />{' '}
              <span title={t('upsetFavOdds')}>
                (<s>{stats.upset.p}%</s>)
              </span>
            </div>
            <div className="sx-lbl">{t('statUpset')}</div>
          </Link>
        )}
        {liveCount > 0 &&
          (liveCount === 1 ? (
            <Link to={`/match/${live[0].id}`} className="card sx-stat sx-live sx-stat-link">
              <div className="sx-num tnum">{liveCount}</div>
              <div className="sx-lbl">
                <span className="sx-live-dot" />
                {t('liveNow')}
              </div>
            </Link>
          ) : (
            <div className="card sx-stat sx-live">
              <div className="sx-num tnum">{liveCount}</div>
              <div className="sx-lbl">
                <span className="sx-live-dot" />
                {t('liveNow')}
              </div>
            </div>
          ))}
      </div>

      <div className="sx-cols">
        <section className="card card-pad sx-card">
          <div className="sx-sec-head">
            <h2>
              {boardMode === 'assists'
                ? t('topAssists')
                : boardMode === 'mins'
                  ? t('topMinutes')
                  : t('topScorers')}
            </h2>
            <div className="sx-seg" role="group" aria-label={t('topScorers')}>
              {(
                [
                  ['goals', t('goals')],
                  ['assists', t('assists')],
                  ['mins', t('minutesPlayed')],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={boardMode === mode ? 'on' : ''}
                  aria-pressed={boardMode === mode}
                  onClick={() => setBoardMode(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {rankedPlayers.length === 0 ? (
            <div className="empty">{t('noStatsYet')}</div>
          ) : (
            <table className="sx-table">
              <thead>
                <tr>
                  <th />
                  <th />
                  <th />
                  <th className={`sx-val-h${boardMode === 'goals' ? ' on' : ''}`}>{t('goals')}</th>
                  <th className={`sx-val-h${boardMode === 'assists' ? ' on' : ''}`}>{t('assists')}</th>
                  <th className={`sx-val-h${boardMode === 'mins' ? ' on' : ''}`}>{t('minutesPlayed')}</th>
                </tr>
              </thead>
              <tbody>
                {rankedPlayers.map((s) => {
                  const team = teams[s.code]
                  return (
                    <tr key={s.id}>
                      <td className="sx-pos tnum">{s.rank}</td>
                      <td className="sx-player">
                        {team && s.no != null ? (
                          <Link className="sx-pname" to={`/team/${s.code}?p=${s.no}`}>
                            {s.name}
                          </Link>
                        ) : (
                          s.name
                        )}
                      </td>
                      <td className="sx-team-cell">
                        {team ? (
                          <Link to={`/team/${s.code}`} className="team-inline sx-team">
                            <Flag team={team} size={20} />
                            <span className="nm">{s.code}</span>
                          </Link>
                        ) : (
                          <span className="muted small">{s.code}</span>
                        )}
                      </td>
                      <td className={`sx-val tnum${boardMode === 'goals' ? ' on' : ''}`}>{s.goals}</td>
                      <td className={`sx-val tnum${boardMode === 'assists' ? ' on' : ''}`}>{s.assists}</td>
                      <td className={`sx-val tnum${boardMode === 'mins' ? ' on' : ''}`}>{s.mins}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        {(stats.cards?.players.length ?? 0) > 0 && (
          <section className="card card-pad sx-card">
            <h2>{t('statCards')}</h2>
            <table className="sx-table">
              <thead>
                <tr>
                  <th />
                  <th />
                  <th className="sx-goals-h">🟨</th>
                  <th className="sx-goals-h">🟥</th>
                </tr>
              </thead>
              <tbody>
                {(stats.cards?.players ?? []).map((c) => {
                  const team = teams[c.code]
                  return (
                    <tr key={c.id}>
                      <td className="sx-player">
                        {team && c.no != null ? (
                          <Link className="sx-pname" to={`/team/${c.code}?p=${c.no}`}>
                            {c.name}
                          </Link>
                        ) : (
                          c.name
                        )}
                      </td>
                      <td className="sx-team-cell">
                        {team ? (
                          <Link to={`/team/${c.code}`} className="team-inline sx-team">
                            <Flag team={team} size={20} />
                            <span className="nm">{c.code}</span>
                          </Link>
                        ) : (
                          <span className="muted small">{c.code}</span>
                        )}
                      </td>
                      <td className="sx-goals tnum">{c.y || ''}</td>
                      <td className="sx-goals tnum">{c.r || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )}

        <section id="sx-fifa-ranking" className="card card-pad sx-card">
          <h2>
            {t('fifaRanking')} <span className="sx-rank-date">({fmtCalendarDate(RANKING_DATE, locale)})</span>
          </h2>
          <div className="sx-rank-list">
            {ranked.map((team) => (
              <div key={team.code} className="sx-rank-row">
                <span className="sx-rank-no tnum">{team.ranking ?? t('none')}</span>
                <TeamName code={team.code} flagSize={20} className="sx-rank-team" />
                <span className="chip" title={t('groupX', { x: team.group })}>
                  {team.group}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section id="sx-fair-play" className="card card-pad sx-card">
          <div className="sx-sec-head">
            <h2>{t('fairPlay')}</h2>
            <div className="sx-seg" role="group" aria-label={t('fairPlay')}>
              <button
                type="button"
                className={fpMode === 'group' ? 'on' : ''}
                aria-pressed={fpMode === 'group'}
                onClick={() => setFpMode('group')}
              >
                {t('stageGroup')}
              </button>
              <button
                type="button"
                className={fpMode === 'all' ? 'on' : ''}
                aria-pressed={fpMode === 'all'}
                onClick={() => setFpMode('all')}
              >
                {t('all')}
              </button>
              <button
                type="button"
                className={fpMode === 'allPerMatch' ? 'on' : ''}
                aria-pressed={fpMode === 'allPerMatch'}
                onClick={() => setFpMode('allPerMatch')}
              >
                {t('all')} ({t('perMatch')})
              </button>
            </div>
          </div>
          <div className="sx-rank-list">
            {fairPlayRows.map((row) => (
              <div key={row.code} className="sx-rank-row">
                <span className="sx-rank-no tnum">
                  {fpMode === 'allPerMatch' ? row.score.toFixed(2) : row.score}
                </span>
                <TeamName code={row.code} flagSize={20} className="sx-rank-team" />
                <span className="chip" title={t('groupX', { x: row.group })}>
                  {row.group}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
