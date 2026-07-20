import { type ReactNode, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Team } from '../types'
import { DATA_FALLBACK, useI18n } from '../i18n'
import { useSettings } from '../settings/SettingsContext'
import { makeTeamMatcher } from '../utils/teamSearch'
import Flag from './Flag'
import Trophy from './Trophy'

/** one team's outcome distribution (all values are probabilities 0..1).
 *  s1..s3 = group finishing position; the o* group is mutually exclusive and
 *  exhaustive (group exit → champion) and sums to 1 across a row. */
export interface FcRow {
  code: string
  s1: number
  s2: number
  s3: number
  oGroup: number
  oR32: number
  oR16: number
  oQf: number
  o4: number
  o3: number
  oRu: number
  oChamp: number
}

type ColKey = Exclude<keyof FcRow, 'code'>

const SECTIONS: { key: string; cols: ColKey[] }[] = [
  { key: 'fcTop4', cols: ['oChamp', 'oRu', 'o3', 'o4'] },
  { key: 'fcElim', cols: ['oQf', 'oR16', 'oR32', 'oGroup'] },
  { key: 'fcSeed', cols: ['s1', 's2', 's3'] },
]
const ALL_COLS = SECTIONS.flatMap((s) => s.cols)

// default / tie-break ordering: champion odds first, then each following column
// left-to-right (runner-up, 3rd, 4th, QF, R16, R32, group exit, then the group-seed
// odds), and finally the FIFA three-letter code alphabetically — fully deterministic.
const naturalCmp = (a: FcRow, b: FcRow): number => {
  for (const c of ALL_COLS) if (b[c] !== a[c]) return b[c] - a[c]
  return a.code.localeCompare(b.code)
}

export default function ForecastTable({ rows, teams }: { rows: FcRow[]; teams: Record<string, Team> }) {
  const { t, pick, lang } = useI18n()
  const { settings } = useSettings()
  const [sortKey, setSortKey] = useState<ColKey | null>('oChamp')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [query, setQuery] = useState('')
  const [grp, setGrp] = useState('all')

  // clicking a header cycles: descending -> ascending -> unsorted (natural) -> ...
  const onSort = (c: ColKey) => {
    if (sortKey !== c) {
      setSortKey(c)
      setSortDir('desc')
    } else if (sortDir === 'desc') {
      setSortDir('asc')
    } else {
      setSortKey(null)
      setSortDir('desc')
    }
  }

  // header label + hover title per column (champion column gets a highlight)
  const head: Record<ColKey, { label: ReactNode; title: string; champ?: boolean }> = {
    s1: { label: t('fcPos1'), title: `${t('fcSeed')} · ${t('fcPos1')}` },
    s2: { label: t('fcPos2'), title: `${t('fcSeed')} · ${t('fcPos2')}` },
    s3: { label: t('fcPos3'), title: `${t('fcSeed')} · ${t('fcPos3')}` },
    oGroup: { label: t('fcGrpExit'), title: t('fcGrpExitTip') },
    oR32: { label: 'R32', title: t('stageR32') },
    oR16: { label: 'R16', title: t('stageR16') },
    oQf: { label: 'QF', title: t('stageQf') },
    o4: { label: t('fcPos4'), title: t('podium4') },
    o3: { label: '🥉', title: t('podium3') },
    oRu: { label: '🥈', title: t('podium2') },
    oChamp: { label: <Trophy size={16} />, title: t('simChampion'), champ: true },
  }

  const groups = useMemo(
    () => [...new Set(rows.map((r) => teams[r.code]?.group).filter((g): g is string => !!g))].sort(),
    [rows, teams],
  )

  const view = useMemo(() => {
    let out = rows
    if (grp === 'fav') out = out.filter((r) => settings.favorites.includes(r.code))
    else if (grp !== 'all') out = out.filter((r) => teams[r.code]?.group === grp)
    // same search as the Teams page: space = AND, diacritic-insensitive, matches
    // code + nickname + the user's language + data-fallback language + English + aliases
    const match = makeTeamMatcher(query, lang, DATA_FALLBACK[lang])
    out = out.filter((r) => {
      const tm = teams[r.code]
      return tm ? match(tm) : false
    })
    if (!sortKey) return out // unsorted: keep the table's natural order
    const dir = sortDir === 'desc' ? 1 : -1
    return [...out].sort((a, b) => dir * (b[sortKey] - a[sortKey]) || naturalCmp(a, b))
  }, [rows, query, grp, sortKey, sortDir, settings.favorites, teams, lang])

  const fmt = (v: number) => {
    const p = v * 100
    return p >= 0.5 ? String(Math.round(p)) : ''
  }
  const heat = (v: number) => ({
    backgroundColor: `color-mix(in oklab, var(--accent) ${Math.round(Math.min(Math.max(v, 0), 1) * 80)}%, transparent)`,
  })

  return (
    <div className="fc-table-wrap">
      <div className="fc-controls">
        <input
          className="input fc-search"
          type="search"
          placeholder={t('fcSearch')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('fcSearch')}
        />
        <select
          className="input fc-grp"
          value={grp}
          onChange={(e) => setGrp(e.target.value)}
          aria-label={t('fcAllGroups')}
        >
          <option value="all">{t('fcAllGroups')}</option>
          {settings.favorites.length > 0 && <option value="fav">{t('fcFav')}</option>}
          {groups.map((g) => (
            <option key={g} value={g}>
              {t('groupX', { x: g })}
            </option>
          ))}
        </select>
      </div>

      <div className="fc-scroll">
        <table className="fc-table tnum">
          <thead>
            <tr>
              <th rowSpan={2} className="fc-team-h" scope="col" />
              {SECTIONS.map((s) => (
                <th key={s.key} colSpan={s.cols.length} className="fc-sec" scope="colgroup">
                  {t(s.key)}
                </th>
              ))}
            </tr>
            <tr>
              {ALL_COLS.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className={`fc-col${head[c].champ ? ' fc-champ-col' : ''}${sortKey === c ? ' fc-sorted' : ''}`}
                >
                  <button
                    type="button"
                    className="fc-col-btn"
                    title={head[c].title}
                    onClick={() => onSort(c)}
                  >
                    {head[c].label}
                    {sortKey === c && (
                      <span className="fc-caret" aria-hidden="true">
                        {sortDir === 'desc' ? '▾' : '▴'}
                      </span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.code}>
                <th scope="row" className="fc-team">
                  <Link to={`/team/${r.code}`}>
                    <Flag team={teams[r.code]} size={16} />
                    <span className="fc-team-name">{pick(teams[r.code]?.name, r.code)}</span>
                  </Link>
                </th>
                {ALL_COLS.map((c) => (
                  <td
                    key={c}
                    className={`fc-cell${head[c].champ ? ' fc-champ-col' : ''}`}
                    style={heat(r[c])}
                    title={`${head[c].title}: ${(r[c] * 100).toFixed(1)}%`}
                  >
                    {fmt(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small fc-note">
        {t('fcPctNote')} {t('probNote')}
      </p>
    </div>
  )
}
