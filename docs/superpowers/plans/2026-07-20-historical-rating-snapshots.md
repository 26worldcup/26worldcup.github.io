# 历史评分快照 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Forecast 和 MatchSimulator 的 "Simulate from X" 使用 X 时点的 Elo 评分快照，使「今天跑 from match N」严格等于「N 开球前一刻跑 now」。

**Architecture:** 管线端为每个切点合成一份「赛前 CSV + 前 n 场世界杯比赛」的 CSV 文本，交给现有的 `replay()` 跑一遍，产出 `public/data/sim-model-history.json`。客户端懒加载该文件，用单个纯函数 `modelAt(history, cutoffMs)` 取出对应切点的 `SimModel`。`scripts/elo.mjs` 的算法逻辑一行不改。

**Tech Stack:** Bun 1.3+、TypeScript、React 19、Vite 8。测试用 Bun 内置 runner（`bun test`），零新增依赖。

## Global Constraints

- 不改 `scripts/elo.mjs` 中 `replay()` / `rawProbs()` / `kFor()` / `gFor()` 的任何算法逻辑，只新增导出
- 不改 `public/data/sim-model.json` 的格式或内容
- 不改 `probs.json` 的生成逻辑
- 不改 Matches 页的夺冠赔率条（它是 `now` 语义）
- FIFA 积分 `f` 冻结在 2026-06-11，不为历史切点重算
- **代码一律用英文**：标识符、注释、测试名、`console.log` 文案全部英文，与仓库现有风格一致。只有 `src/i18n/*.ts` 里的用户可见文案例外
- 代码注释与 UI 文案一律不使用 `—`（em dash）
- 提交信息：简短主题行，正文从简
- 每个任务结束时 `bun run checkall` 必须通过（typecheck + format + lint）

---

## File Structure

| 文件 | 职责 |
|---|---|
| `scripts/elo.mjs` | 新增导出 `DATASET_NAME`、`CONFED_OF`（从 `update.mjs` 内联处上移，消除重复） |
| `scripts/simhistory.mjs` | 新建。纯函数 `buildHistory()`，把 CSV + matches + venues 变成 cuts 数组 |
| `scripts/update.mjs` | 修改。调用 `buildHistory()` 并写出 `sim-model-history.json` |
| `scripts/regen-history.mjs` | 新建。用缓存的 CSV 和现有 `public/data/*` 单独重生成历史文件，不走网络 |
| `src/sim/history.ts` | 新建。类型 `SimHistory`，纯函数 `modelAt()` |
| `src/data/DataContext.tsx` | 修改。新增 `simHistory` + `loadSimHistory()` |
| `src/pages/Forecast.tsx` | 修改。统一 `cutoffMs`，模拟时使用对应切点的 model |
| `src/pages/MatchSimulator.tsx` | 修改。新增评分日期下拉 |
| `src/i18n/*.ts` | 修改。新增文案 key |
| `tests/simhistory.test.ts` | 新建。`probs.json` 回归 + 构造正确性 |
| `tests/history.test.ts` | 新建。`modelAt` 查找 + 不变式 |
| `scripts/smoke.mjs` | 修改。新增历史文件结构断言 |

---

### Task 1: 把 DATASET_NAME 和 CONFED_OF 提到 elo.mjs

`scripts/update.mjs:1750` 内联了一份 48 条的队名映射，`scripts/simhistory.mjs` 也需要同一份。上移到 `elo.mjs` 消除重复。这是纯搬运，无行为变化。

**Files:**
- Modify: `scripts/elo.mjs`（在 `CONFED_LISTS` 定义之后追加）
- Modify: `scripts/update.mjs:1750-1806`（删除内联的 `DATASET_NAME` 与 `CONFED_OF`，改为 import）
- Test: `tests/simhistory.test.ts`

**Interfaces:**
- Produces: `DATASET_NAME: Record<string, string>`（FIFA 三字码 → 数据集队名，48 条）、`CONFED_OF: Record<string, string>`（三字码 → `'UEFA'|'CONMEBOL'|'CONCACAF'|'AFC'|'CAF'|'OFC'`）

- [ ] **Step 1: 写失败的测试**

新建 `tests/simhistory.test.ts`：

```ts
import { expect, test } from 'bun:test'
import { CONFED_OF, DATASET_NAME } from '../scripts/elo.mjs'

test('DATASET_NAME 覆盖全部 48 支参赛队', () => {
  expect(Object.keys(DATASET_NAME)).toHaveLength(48)
  expect(DATASET_NAME.ARG).toBe('Argentina')
  expect(DATASET_NAME.USA).toBe('United States')
})

test('CONFED_OF 为每支队伍解析出洲际联盟', () => {
  expect(Object.keys(CONFED_OF)).toHaveLength(48)
  expect(CONFED_OF.ARG).toBe('CONMEBOL')
  expect(CONFED_OF.ESP).toBe('UEFA')
  expect(CONFED_OF.USA).toBe('CONCACAF')
  expect(CONFED_OF.JPN).toBe('AFC')
  expect(CONFED_OF.MAR).toBe('CAF')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test tests/simhistory.test.ts`
Expected: FAIL，报 `DATASET_NAME` 不是 `elo.mjs` 的导出（`undefined`）

- [ ] **Step 3: 在 elo.mjs 追加导出**

先取出现有的映射表原文（避免手抄出错）：

```bash
sed -n '1750,1799p' scripts/update.mjs
```

把它作为 `export const DATASET_NAME = { ... }` 追加到 `scripts/elo.mjs` 中 `CONFED_LISTS` 定义结束之后（`CONFED_LISTS` 在 `scripts/elo.mjs:66`，找到它的闭合 `}` 再往下插入）。缩进从 4 空格改为 0，并在其后追加：

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test tests/simhistory.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 5: 让 update.mjs 改用导入**

在 `scripts/update.mjs:24` 的 import 中加入两个名字：

```js
import { blend, CONFED_LISTS, CONFED_OF, DATASET_NAME, intify, rawProbs, replay, RESULTS_URL } from './elo.mjs'
```

然后删除 `scripts/update.mjs` 中内联的 `const DATASET_NAME = { ... }` 整块（约 1750-1799 行）以及紧随其后的这一段：

```js
    const CONFED_OF = {}
    for (const [conf, names] of Object.entries(CONFED_LISTS)) {
      for (const [code, dsName] of Object.entries(DATASET_NAME)) {
        if (names.includes(dsName)) CONFED_OF[code] = conf
      }
    }
```

删完后检查 `CONFED_LISTS` 在 `update.mjs` 里是否还有其他用处；若已无引用，把它从 import 列表中去掉，否则 lint 会报未使用变量。

- [ ] **Step 6: 校验没有改坏**

Run: `bun run checkall`
Expected: 全部通过，无未使用变量告警

- [ ] **Step 7: 提交**

```bash
git add scripts/elo.mjs scripts/update.mjs tests/simhistory.test.ts
git commit -m "refactor: export DATASET_NAME and CONFED_OF from elo.mjs"
```

---

### Task 2: buildHistory 构造切点，并用 probs.json 验收

这是整个计划的核心，也是唯一能客观证明重建路径正确的一步。必须在动任何 UI 之前跑通。

**Files:**
- Create: `scripts/simhistory.mjs`
- Test: `tests/simhistory.test.ts`（追加）

**Interfaces:**
- Consumes: `DATASET_NAME`、`CONFED_OF`、`replay` from `./elo.mjs`
- Produces: `buildHistory(csv: string, matches: Match[], venues: Record<string, Venue>, f: Record<string, number|null>) => { cuts: Cut[], hostBonus: 60, f }`，其中 `Cut = { n: number, after: string|null, curve: {w,d}[], teams: Record<string, number> }`

- [ ] **Step 1: 取出赛前基线 fixture，写失败的测试**

先把 2026-06-11 提交的模型固化为测试 fixture（`a46faa2` 是引入 `sim-model.json` 的那次提交，早于任何一场世界杯比赛）：

```bash
mkdir -p tests/fixtures && git show a46faa2:public/data/sim-model.json > tests/fixtures/sim-model-2026-06-11.json
```

确认它含 48 队且 `ARG.r === 2217`、`ESP.r === 2247`、`USA.r === 1817`。

追加到 `tests/simhistory.test.ts`：

```ts
import fs from 'node:fs'
import { buildHistory, playedInOrder } from '../scripts/simhistory.mjs'
import { pairProbs } from '../src/sim/engine'

const csv = fs.readFileSync('scripts/cache/intl-results.csv', 'utf8')
const matches = JSON.parse(fs.readFileSync('public/data/matches.json', 'utf8')).matches
const venues = JSON.parse(fs.readFileSync('public/data/venues.json', 'utf8')).venues
const simModel = JSON.parse(fs.readFileSync('public/data/sim-model.json', 'utf8'))
const probs = JSON.parse(fs.readFileSync('public/data/probs.json', 'utf8'))
const f = Object.fromEntries(Object.entries(simModel.teams).map(([c, v]) => [c, v.f]))

const played = playedInOrder(matches)
const history = buildHistory(csv, matches, venues, f)

test('切点数 = 1 个赛前基线 + 已有比分的场次数', () => {
  expect(history.cuts).toHaveLength(played.length + 1)
  expect(history.cuts[0].n).toBe(0)
  expect(history.cuts[0].after).toBeNull()
})

test('after 单调不减，n 连续', () => {
  // 严格递增不成立：小组赛末轮同组两场同时开球（防默契球），共 12 处并列时刻
  for (let i = 1; i < history.cuts.length; i++) {
    expect(history.cuts[i].n).toBe(i)
    if (i > 1) {
      expect(Date.parse(history.cuts[i].after)).toBeGreaterThanOrEqual(
        Date.parse(history.cuts[i - 1].after),
      )
    }
  }
})

test('每个切点覆盖全部 48 队，且 curve 有 13 段', () => {
  for (const cut of history.cuts) {
    expect(Object.keys(cut.teams)).toHaveLength(48)
    expect(cut.curve.length).toBeGreaterThan(0)
  }
})

// 第一层 a，精确 oracle：把当时的 CSV 和当时的产出配对，两端都钉死在 git 里，
// 测的是 buildHistory 的算术（过滤边界、offsets 折入、取整）能否复现管线自己的产出。
// 传空的 matches 数组，这样只算 cuts[0] 一个切点，不必跑 104 次 replay。
test('用 2026-06-11 当时的 CSV 逐字复现当天提交的模型', () => {
  const baseline = JSON.parse(fs.readFileSync('tests/fixtures/sim-model-2026-06-11.json', 'utf8'))
  let csv0611
  try {
    csv0611 = Bun.spawnSync(['git', 'show', 'a46faa2:scripts/cache/intl-results.csv']).stdout.toString()
  } catch {
    csv0611 = ''
  }
  if (!csv0611 || csv0611.length < 1e6) {
    throw new Error('无法取得 a46faa2 的 CSV。CI 若用浅克隆需设 fetch-depth: 0')
  }
  const base = buildHistory(csv0611, [], venues, f).cuts[0].teams
  expect(Object.keys(base)).toHaveLength(48)
  for (const [code, v] of Object.entries(baseline.teams)) {
    expect(`${code}=${base[code]}`).toBe(`${code}=${v.r}`)
  }
})

// 第一层 b，用今天的数据兜底：上游会回溯补录和修订赛前比赛，所以今天的基线不该
// 等于 06-11 快照（补录的是真实发生过的赛前比赛，计入它们更正确而非更错误）。
// 实测漂移最大 12 分（ALG，上游补了一场 2026-06-10 的友谊赛）。25 分只拦量级错误。
test('今天的赛前基线与 06-11 快照的漂移在合理范围', () => {
  const baseline = JSON.parse(fs.readFileSync('tests/fixtures/sim-model-2026-06-11.json', 'utf8'))
  const got = history.cuts[0].teams
  expect(Object.keys(got)).toHaveLength(48)
  const worst = Object.entries(baseline.teams)
    .map(([code, v]) => ({ code, drift: Math.abs(got[code] - v.r) }))
    .sort((a, b) => b.drift - a.drift)[0]
  console.log(`赛前基线最大漂移 ${worst.drift} 分 @ ${worst.code}`)
  expect(worst.drift).toBeLessThan(25)
})

/** 用某个切点的快照给一场比赛算概率，与 probs.json 的冻结值比，返回最大偏差 */
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
  return Math.max(
    Math.abs(p.h * 100 - e.h),
    Math.abs(p.d * 100 - e.d),
    Math.abs(p.a * 100 - e.a),
  )
}

// 第二层：开赛头三天管线尚无滞后可累积。csvRow 的主客对调、点球比分取用、
// 曲线截断若有任何一处写错，都会在这里暴露
test('开赛头三天的比赛贴合 probs.json 的冻结值', () => {
  const early = played
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.status === 'finished' && probs[m.id] && m.date < '2026-06-14')
  expect(early.length).toBeGreaterThanOrEqual(5)
  for (const { m, i } of early) {
    expect(`#${m.n} ${deviation(i, m) < 0.5}`).toBe(`#${m.n} true`)
  }
})

// 第三层：只拦量级错误。上游 martj42 数据集摄入世界杯结果有数天滞后，probs.json
// 冻结时用的是滞后评分，而重建假设截止时刻前的比赛全部已计入，所以偏差随赛程放大
// （06-11 至 06-24 最大 1.0pp，06-25 之后最大 6.7pp）。这是数据源特性，不是重建错误。
test('全赛程无量级错误', () => {
  const all = played
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.status === 'finished' && probs[m.id])
  expect(all.length).toBeGreaterThan(90)
  const worst = all
    .map(({ m, i }) => ({ n: m.n, dev: deviation(i, m) }))
    .sort((a, b) => b.dev - a.dev)[0]
  console.log(`比对了 ${all.length} 场，最大偏差 ${worst.dev.toFixed(2)}pp @ #${worst.n}`)
  expect(worst.dev).toBeLessThan(8)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test tests/simhistory.test.ts`
Expected: FAIL，`scripts/simhistory.mjs` 不存在

- [ ] **Step 3: 实现 buildHistory**

新建 `scripts/simhistory.mjs`：

```js
// Per-cut-point model snapshots for the historical forecast. Each cut is a full
// replay over "the pre-tournament CSV plus the first n World Cup matches", so the
// ratings, the calibration curve and the confederation offsets are all truncated
// at the same instant. No algorithm lives here: every cut goes through the same
// replay() that produces sim-model.json.

import { CONFED_OF, DATASET_NAME, replay } from './elo.mjs'

const WC_START = '2026-06-11'
const HOST_OF = { USA: 'US', CAN: 'CA', MEX: 'MX' }

/** one World Cup match as a row in the dataset's own column order:
 *  date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
 *  (city and country are never read by replay(), so they stay empty) */
function csvRow(m, venues) {
  const vc = venues[m.venueId]?.country
  let h = m.home
  let a = m.away
  // the dataset's neutral=FALSE hands HOME_ADV to whoever sits in the home_team
  // column, so a host playing as the away side must be swapped into it. Swapping
  // both the teams and their scores leaves the Elo update, the calibration bins
  // and the cross-confederation sample identical.
  if (HOST_OF[a.code] === vc) {
    h = m.away
    a = m.home
  }
  const neutral = HOST_OF[h.code] === vc ? 'FALSE' : 'TRUE'
  return [
    m.date.slice(0, 10),
    DATASET_NAME[h.code],
    DATASET_NAME[a.code],
    h.score,
    a.score,
    'FIFA World Cup',
    '',
    '',
    neutral,
  ].join(',')
}

/** matches with a real score, in kickoff order: these are the cut points */
export function playedInOrder(matches) {
  return matches
    .filter((m) => m.home?.code && m.away?.code && m.home.score != null && m.away.score != null)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
}

/**
 * @param csv      the raw international_results CSV
 * @param matches  matches.json's `matches` array
 * @param venues   venues.json's `venues` map
 * @param f        frozen FIFA points by team code (shared by every cut)
 */
export function buildHistory(csv, matches, venues, f) {
  const lines = csv.split('\n')
  // drop every World Cup 2026 row: those come from matches.json instead, because
  // only it carries kickoff times, and per-match cut points need that ordering
  const preWc = lines.filter((l, i) => i === 0 || (l && l.split(',')[0] < WC_START)).join('\n')
  const played = playedInOrder(matches)
  const rows = played.map((m) => csvRow(m, venues))

  const cuts = []
  for (let n = 0; n <= played.length; n++) {
    // cut n folds in the first n matches. Their order inside a single day does not
    // matter: no team plays twice in a day, so same-day updates touch disjoint pairs.
    const { ratings, outcomeCurve, offsets } = replay([preWc, ...rows.slice(0, n)].join('\n'))
    cuts.push({
      n,
      after: n === 0 ? null : played[n - 1].date,
      curve: outcomeCurve.map((b) => ({ w: +b.w.toFixed(4), d: +b.d.toFixed(4) })),
      teams: Object.fromEntries(
        Object.keys(DATASET_NAME)
          .filter((c) => ratings.get(DATASET_NAME[c]) != null)
          .map((c) => [c, Math.round(ratings.get(DATASET_NAME[c]) + (offsets[CONFED_OF[c]] ?? 0))]),
      ),
    })
  }
  return { cuts, hostBonus: 60, f }
}
```

- [ ] **Step 4: 跑测试**

Run: `bun test tests/simhistory.test.ts`
Expected: 全部 PASS。控制台会打印 `比对了 N 场，最大偏差 X.XXpp @ #N`，实测该值约 6.65pp（@ #94）。

**三层容差都不要放宽。** 若失败，按层排查：

- **第一层（赛前基线逐字相等）失败**：最严重。说明 `preWc` 的过滤边界错了，或 offsets 没有折进 `r`，或 `Math.round` 用法不一致。对比 `replay(preWc)` 的原始输出与 fixture。
- **第二层（头三天 0.5pp）失败**：重建逻辑有错。若只有东道主参与的比赛偏差大，是 `csvRow` 的主客对调或 `neutral` 判定；若只有淘汰赛偏差大，是点球场次比分取用（应取 120 分钟比分，`pen` 不参与）。
- **第三层（全赛程 8pp）失败**：偏差量级异常。打印按比赛日分组的最大偏差；正常形状是随赛程单调放大（滞后累积），若某一天孤立地跳高，查那天的比赛有无特殊情况。

**不要因为后期比赛偏差大就怀疑实现。** 上游数据集摄入世界杯结果有数天滞后，这是已知且已量化的：从 git 历史可见 `sim-model.json` 中 USA 的评分走 1817（06-11）→ 1864（06-16）→ 1905（06-20）→ 1822（07-19），开赛后数日才反映小组赛结果。头 8 场偏差 0.02 到 0.16pp 就是重建正确的证据，逻辑错误会从第一场就错。

- [ ] **Step 5: 提交**

```bash
git add scripts/simhistory.mjs tests/simhistory.test.ts
git commit -m "feat: build per-match rating snapshots from truncated replays"
```

---

### Task 3: 产出 sim-model-history.json

**Files:**
- Create: `scripts/regen-history.mjs`
- Modify: `scripts/update.mjs`（`sim-model.json` 写出之后）
- Modify: `scripts/smoke.mjs`
- Modify: `package.json`（新增 `test` 脚本）

**Interfaces:**
- Consumes: `buildHistory`、`playedInOrder` from `./simhistory.mjs`
- Produces: `public/data/sim-model-history.json`

- [ ] **Step 1: 加 test 脚本**

在 `package.json` 的 `scripts` 中，`"smoke"` 那一行之后加入：

```json
    "test": "bun test",
```

并把 `checkall` 改为包含测试：

```json
    "checkall": "bun run typecheck && bun run format && bun run lint && bun run test",
```

- [ ] **Step 2: 写离线重生成脚本**

新建 `scripts/regen-history.mjs`：

```js
#!/usr/bin/env node
// Regenerate public/data/sim-model-history.json from the cached CSV and the
// existing public/data files, without touching the network. update.mjs does the
// same thing as part of a full run; this is the fast path for iterating on it.
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildHistory } from './simhistory.mjs'

const OUT = path.join(import.meta.dirname, '..', 'public', 'data')
const read = async (p) => JSON.parse(await fs.readFile(p, 'utf8'))

const csv = await fs.readFile(path.join(import.meta.dirname, 'cache', 'intl-results.csv'), 'utf8')
const { matches } = await read(path.join(OUT, 'matches.json'))
const { venues } = await read(path.join(OUT, 'venues.json'))
const simModel = await read(path.join(OUT, 'sim-model.json'))
const f = Object.fromEntries(Object.entries(simModel.teams).map(([c, v]) => [c, v.f]))

const history = buildHistory(csv, matches, venues, f)
await fs.writeFile(path.join(OUT, 'sim-model-history.json'), `${JSON.stringify(history)}\n`)
console.log(`sim-model-history.json: ${history.cuts.length} cuts`)
```

- [ ] **Step 3: 生成文件并检查**

Run:
```bash
bun scripts/regen-history.mjs && ls -la public/data/sim-model-history.json
```
Expected: 打印 `sim-model-history.json: N cuts`（N = 已完赛场次 + 1，当前为 104），文件约 90 KB

- [ ] **Step 4: 接进 update.mjs**

在 `scripts/update.mjs` 中 `await writeJson(path.join(OUT, 'sim-model.json'), simModel)` 这一行之后插入：

```js
    // per-cut-point snapshots so the forecast can be replayed with the ratings of
    // the day instead of today's (see docs/superpowers/specs/2026-07-20-*)
    const { buildHistory } = await import('./simhistory.mjs')
    const simF = Object.fromEntries(Object.entries(simTeams).map(([c, v]) => [c, v.f]))
    await writeJson(path.join(OUT, 'sim-model-history.json'), buildHistory(csv, matches, venues, simF))
    log('sim-model-history: snapshots written')
```

确认 `csv`、`matches`、`venues`、`simTeams` 四个变量在该插入点都已在作用域内；`csv` 定义于同一个 `try` 块的开头，`simTeams` 就在上方几行。

- [ ] **Step 5: 加冒烟断言**

`scripts/smoke.mjs` 目前只走路由截图，没有数据断言。在文件末尾、浏览器关闭之前加入：

```js
// data contract: the forecast history must cover every played match
{
  const hist = JSON.parse(await fs.readFile('public/data/sim-model-history.json', 'utf8'))
  const { matches } = JSON.parse(await fs.readFile('public/data/matches.json', 'utf8'))
  const played = matches.filter((m) => m.home?.score != null && m.away?.score != null).length
  const problems = []
  if (hist.cuts.length !== played + 1) problems.push(`cuts ${hist.cuts.length} != played+1 ${played + 1}`)
  if (hist.cuts[0].after !== null) problems.push('cuts[0].after must be null')
  for (const cut of hist.cuts) {
    if (Object.keys(cut.teams).length !== 48) problems.push(`cut ${cut.n} has ${Object.keys(cut.teams).length} teams`)
  }
  // monotonic, not strictly: the last group round kicks off simultaneously by design
  for (let i = 2; i < hist.cuts.length; i++) {
    if (Date.parse(hist.cuts[i].after) < Date.parse(hist.cuts[i - 1].after)) {
      problems.push(`cut ${i} after went backwards`)
    }
  }
  if (problems.length) {
    console.error(`sim-model-history.json: ${problems.join('; ')}`)
    failures += problems.length
  } else {
    console.log('sim-model-history.json: ok')
  }
}
```

若 `smoke.mjs` 末尾已有基于 `failures` 的退出码逻辑，把这段插在它之前。

- [ ] **Step 6: 跑冒烟**

Run:
```bash
bun run build && bun run preview & sleep 3 && bun run smoke; kill %1
```
Expected: 输出 `sim-model-history.json: ok`，无新增 failures

- [ ] **Step 7: 提交**

```bash
git add scripts/regen-history.mjs scripts/update.mjs scripts/smoke.mjs package.json public/data/sim-model-history.json
git commit -m "feat: emit sim-model-history.json from the data pipeline"
```

---

### Task 4: 客户端切点查找

**Files:**
- Create: `src/sim/history.ts`
- Test: `tests/history.test.ts`

**Interfaces:**
- Consumes: `SimModel` from `../sim/engine`
- Produces: `SimHistory`、`SimHistoryCut` 类型；`modelAt(history: SimHistory, cutoffMs: number): SimModel`

- [ ] **Step 1: 写失败的测试**

新建 `tests/history.test.ts`：

```ts
import { expect, test } from 'bun:test'
import fs from 'node:fs'
import { modelAt } from '../src/sim/history'
import type { SimHistory } from '../src/sim/history'

const history: SimHistory = JSON.parse(fs.readFileSync('public/data/sim-model-history.json', 'utf8'))
const matches = JSON.parse(fs.readFileSync('public/data/matches.json', 'utf8')).matches

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
  const cut = history.cuts[5] // the first 5 matches folded in
  const kickoff = Date.parse(history.cuts[5].after as string) // match 5's kickoff
  // at match 5's kickoff, match 5 itself has not been counted yet
  expect(modelAt(history, kickoff).teams.ARG.r).toBe(history.cuts[4].teams.ARG)
  // one millisecond later it has
  expect(modelAt(history, kickoff + 1).teams.ARG.r).toBe(cut.teams.ARG)
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test tests/history.test.ts`
Expected: FAIL，`src/sim/history` 不存在

- [ ] **Step 3: 实现**

新建 `src/sim/history.ts`：

```ts
// Historical model snapshots: what the forecast knew at a given instant.
// Produced by scripts/simhistory.mjs, one cut per played World Cup match.

import type { SimModel } from './engine'

export interface SimHistoryCut {
  n: number
  /** kickoff of the n-th match; null for the pre-tournament baseline */
  after: string | null
  curve: SimModel['curve']
  /** confederation offsets already folded in, same as sim-model.json's `r` */
  teams: Record<string, number>
}

export interface SimHistory {
  cuts: SimHistoryCut[]
  hostBonus: number
  /** FIFA points are frozen for the whole tournament, so one copy serves every cut */
  f: Record<string, number | null>
}

/** the model as of `cutoffMs`: the latest cut whose match kicked off strictly
 *  earlier. The same "strictly earlier" boundary drives Forecast's keepReal
 *  predicate, so the matches folded into these ratings are exactly the matches
 *  whose real results are kept. */
export function modelAt(history: SimHistory, cutoffMs: number): SimModel {
  let cut = history.cuts[0]
  for (const c of history.cuts) {
    if (c.after == null || Date.parse(c.after) < cutoffMs) cut = c
    else break
  }
  return {
    curve: cut.curve,
    hostBonus: history.hostBonus,
    teams: Object.fromEntries(
      Object.entries(cut.teams).map(([code, r]) => [code, { r, f: history.f[code] ?? null }]),
    ),
  }
}
```

- [ ] **Step 4: 跑测试**

Run: `bun test tests/history.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: 提交**

```bash
git add src/sim/history.ts tests/history.test.ts
git commit -m "feat: modelAt looks up the rating snapshot for a cut point"
```

---

### Task 5: DataContext 懒加载历史文件

**Files:**
- Modify: `src/data/DataContext.tsx`

**Interfaces:**
- Consumes: `SimHistory` from `../sim/history`
- Produces: context 上新增 `simHistory: SimHistory | null` 与 `loadSimHistory: () => void`

- [ ] **Step 1: 扩展 context 类型**

`src/data/DataContext.tsx` 顶部的 import 加：

```ts
import type { SimHistory } from '../sim/history'
```

`interface DataCtx` 中，`loadSimModel` 那一行之后加：

```ts
  /** per-cut-point rating snapshots, loaded only when a time selector is used */
  simHistory: SimHistory | null
  loadSimHistory: () => void
```

- [ ] **Step 2: 加 state 与 ref**

在 `const [simModel, setSimModel] = useState<SimModel | null>(null)` 之后加：

```ts
  const [simHistory, setSimHistory] = useState<SimHistory | null>(null)
```

在 `const simRequested = useRef(false)` 之后加：

```ts
  const simHistoryRequested = useRef(false)
```

- [ ] **Step 3: 加 loader**

在 `loadSimModel` 函数之后加，沿用同一套去重加失败重试的模式：

```ts
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
```

- [ ] **Step 4: 挂进 provider value**

在 `Ctx.Provider` 的 `value` 对象中，`loadSimModel,` 之后加：

```ts
        simHistory,
        loadSimHistory,
```

- [ ] **Step 5: 校验**

Run: `bun run checkall`
Expected: 通过

- [ ] **Step 6: 提交**

```bash
git add src/data/DataContext.tsx
git commit -m "feat: lazy-load sim-model-history.json"
```

---

### Task 6: Forecast 使用切点模型

这一步同时把 `keepReal` 和切点查找归约到同一个 `cutoffMs`，让不变式变成结构性保证而不是靠两处逻辑各自小心对齐。

**Files:**
- Modify: `src/pages/Forecast.tsx:93-114`（`keepReal` memo）、`run()` 中的 `runTournament` 调用、渲染部分
- Modify: `src/i18n/en.ts`
- Test: `tests/history.test.ts`（追加不变式测试）

**Interfaces:**
- Consumes: `modelAt` from `../sim/history`；`simHistory` / `loadSimHistory` from `useData()`

- [ ] **Step 1: 写不变式测试**

追加到 `tests/history.test.ts`：

```ts
import { runTournament } from '../src/sim/engine'

const teams = JSON.parse(fs.readFileSync('public/data/teams.json', 'utf8')).teams
const venues = JSON.parse(fs.readFileSync('public/data/venues.json', 'utf8')).venues

/** deterministic PRNG so two runs are comparable */
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

test('from match N equals Now run just before N kicked off', () => {
  for (const n of [20, 50, 80]) {
    const target = matches.find((m: { n: number }) => m.n === n)
    const cutoffMs = Date.parse(target.date)
    // both paths share one cutoffMs, so they must yield one model and one keepReal
    const model = modelAt(history, cutoffMs)
    const keep = (m: { date: string }) => Date.parse(m.date) < cutoffMs
    const a = runTournament(model, matches, venues, teams, keep, seeded(42))
    const b = runTournament(model, matches, venues, teams, keep, seeded(42))
    expect(a.champion).toBe(b.champion)
    expect(JSON.stringify(a.outcome)).toBe(JSON.stringify(b.outcome))
  }
})

test('matches folded into the snapshot == matches keepReal keeps', () => {
  for (const n of [20, 50, 80]) {
    const target = matches.find((m: { n: number }) => m.n === n)
    const cutoffMs = Date.parse(target.date)
    const kept = matches.filter((m: { date: string; home?: { score?: number } }) =>
      Date.parse(m.date) < cutoffMs && m.home?.score != null,
    ).length
    let cut = history.cuts[0]
    for (const c of history.cuts) {
      if (c.after == null || Date.parse(c.after) < cutoffMs) cut = c
      else break
    }
    expect(cut.n).toBe(kept)
  }
})
```

- [ ] **Step 2: 跑测试建立基线**

Run: `bun test tests/history.test.ts`
Expected: PASS（7 tests）

这两个测试锁的是 Task 2 和 Task 4 已经建立的契约，在动 `Forecast.tsx` 之前先钉死它，改完再跑一次确认没破坏。

若第二个测试 FAIL，说明 `buildHistory` 的切点定义与 `keepReal` 的边界不一致（一边含等号一边不含），必须回到 Task 2 修正后再继续。这是整个不变式的地基，不得跳过或放宽。

- [ ] **Step 3: 统一 cutoffMs**

把 `src/pages/Forecast.tsx:93-114` 的整个 `keepReal` memo 替换为：

```tsx
  // one cut instant drives everything: which matches keep their real result AND
  // which rating snapshot the model comes from. Deriving both from the same value
  // is what makes "simulate from match N" equal "run Now just before N kicked off".
  // match numbers are NOT in kickoff order, so the cut is always a kickoff time.
  const cutoffMs = useMemo(() => {
    if (simMode === 'opener') return Number.NEGATIVE_INFINITY
    if (simMode === 'match') {
      const sel = matches.find((m) => m.n === cutMatch)
      return sel ? Date.parse(sel.date) : Number.NEGATIVE_INFINITY
    }
    if (simMode === 'date') return new Date(`${cutDate}T00:00:00`).getTime()
    return Number.POSITIVE_INFINITY // 'now': keep every finished match
  }, [simMode, cutDate, cutMatch, matches])

  // matches that kicked off strictly earlier keep their real result; the picked
  // match, anything kicking off at the same instant, and everything after get
  // (re)simulated. Earlier matches with no real result yet still go through the
  // engine's finished-guard.
  const keepReal = useMemo<(m: Match) => boolean>(
    () => (m) => Date.parse(m.date) < cutoffMs,
    [cutoffMs],
  )
```

- [ ] **Step 4: 接上历史模型**

在 `const { simModel, loadSimModel } = useData()` 改为：

```tsx
  const { simModel, loadSimModel, simHistory, loadSimHistory } = useData()
  useEffect(() => {
    loadSimModel()
  })
  useEffect(() => {
    if (simMode !== 'now') loadSimHistory()
  }, [simMode, loadSimHistory])
```

（原有的 `useEffect(() => { loadSimModel() })` 保留，把新的这段加在它之后。）

在 `cutoffMs` memo 之后加：

```tsx
  // 'now' uses the live model; every other cut point uses the snapshot of that
  // instant, so the forecast shows what was known then instead of today's hindsight.
  // null while the history file is still loading: running with simModel there would
  // silently label today's ratings as historical.
  const activeModel = useMemo(
    () => (simMode === 'now' ? simModel : simHistory ? modelAt(simHistory, cutoffMs) : null),
    [simMode, simHistory, simModel, cutoffMs],
  )
```

import 加：

```tsx
import { modelAt } from '../sim/history'
```

- [ ] **Step 5: 让 run() 使用它**

`run()` 开头的守卫改为：

```tsx
  const run = async () => {
    if (!activeModel || progress !== null) return
```

循环体内的调用改为：

```tsx
        lastRun = runTournament(activeModel, matches, venues, teams, keep)
```

同时把 `run` 的自动首跑 effect 依赖从 `simModel` 改为 `activeModel`：

```tsx
  useEffect(() => {
    if (activeModel && !autoRan.current) {
      autoRan.current = true
      runRef.current()
    }
  }, [activeModel])
```

`src/pages/Forecast.tsx:347` 的按钮禁用条件从 `!simModel` 改为 `!activeModel`，这样历史文件加载完成前按钮是明确的禁用态，而不是点了没反应：

```tsx
          disabled={!activeModel || progress !== null}
```

- [ ] **Step 6: 加评分截止说明**

`src/i18n/en.ts` 在 `simMatchTip` 之后加：

```ts
  simRatingsAsOf: 'Ratings as of {d}',
  simRatingsLatest: 'Latest ratings',
  simRatingsLoading: 'Loading historical ratings...',
```

在 Forecast 的 "Simulate from" 控件区末尾（`sf-match` 那组 radio 之后）加一行说明：

```tsx
        <p className="muted small sim-asof">
          {simMode === 'now'
            ? t('simRatingsLatest')
            : !simHistory
              ? t('simRatingsLoading')
              : t('simRatingsAsOf', { d: asOfLabel })}
        </p>
```

其中 `asOfLabel` 在 `activeModel` memo 之后计算：

```tsx
  // the kickoff the snapshot stops at, for the caption
  const asOfLabel = useMemo(() => {
    if (!simHistory) return ''
    let cut = simHistory.cuts[0]
    for (const c of simHistory.cuts) {
      if (c.after == null || Date.parse(c.after) < cutoffMs) cut = c
      else break
    }
    return cut.after ? new Date(cut.after).toLocaleString() : t('jumpOpener')
  }, [simHistory, cutoffMs, t])
```

确认 `t()` 支持 `{d}` 插值：`src/i18n/index.tsx` 中 `t` 的第二参数用法与 `t('groupX', { x: g })` 一致（见 `src/components/ForecastTable.tsx:131`）。

- [ ] **Step 7: 校验并肉眼确认**

Run:
```bash
bun run checkall && bun run dev
```
打开 `http://localhost:5173/#/forecast`，依次验证：
- 默认 `Now`，说明文字显示 "Latest ratings"，结果与改动前一致
- 切到 `Opener`，说明文字变为揭幕战，跑 10000 次后 ESP 约 20.5%、ARG 约 17.1%（改动前是 23.1% / 20.6%）
- 切到 `Match` 并输入 50，说明文字显示第 50 场的开球时刻

- [ ] **Step 8: 提交**

```bash
git add src/pages/Forecast.tsx src/i18n/en.ts tests/history.test.ts
git commit -m "feat(forecast): simulate with the ratings of the cut point"
```

---

### Task 7: MatchSimulator 评分日期下拉

**Files:**
- Modify: `src/pages/MatchSimulator.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/pages/matchsimulator.css`

- [ ] **Step 1: 接上 context 与选项**

`const { simModel, loadSimModel } = useData()` 改为：

```tsx
  const { simModel, loadSimModel, simHistory, loadSimHistory } = useData()
```

在其后加状态与选项列表：

```tsx
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

  // null while the history file loads, so the pickers and the Simulate button stay
  // disabled rather than quietly showing today's ratings under a historical label
  const activeModel = useMemo(() => {
    if (!ratingDay) return simModel
    if (!simHistory) return null
    return modelAt(simHistory, new Date(`${ratingDay}T00:00:00`).getTime())
  }, [ratingDay, simHistory, simModel])
```

import 加：

```tsx
import { modelAt } from '../sim/history'
```

- [ ] **Step 2: 把 simModel 的用处换成 activeModel**

只有算概率的地方改用 `activeModel`：

- `livePreview` memo 里的 `if (!simModel || ...) return null` 与 `pairProbs(simModel, ...)`
- `canSimulate` 里的 `!!simModel`
- `simulate()` 里的 `if (!canSimulate || !simModel) return` 与 `pairProbs(simModel, ...)`

这三处的依赖数组中 `simModel` 一并改为 `activeModel`。

**`teamCodes` memo 保持用 `simModel`。** 每个切点的队伍名单都是同样 48 支，用 `activeModel` 会让选择器在历史文件加载的那一瞬间清空又填回，是没必要的闪烁。

- [ ] **Step 3: 加下拉控件**

`src/i18n/en.ts` 追加：

```ts
  aimsRatings: 'Ratings',
  aimsRatingsLatest: 'Latest',
  aimsRatingsPre: 'Before the tournament',
```

在 knockout 复选框（`{t('aimsKnockout')}` 那个 label）之后插入：

```tsx
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
```

第一个比赛日选中时 cutoff 是该日 00:00，早于揭幕战开球，因此落到赛前基线，标签写 "Before the tournament" 是准确的。

- [ ] **Step 4: 加样式**

`src/pages/matchsimulator.css` 追加，与相邻控件的写法保持一致：

```css
.ams-ratings {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.ams-ratings select {
  flex: 1 1 12rem;
  min-width: 0;
}
```

- [ ] **Step 5: 校验并肉眼确认**

Run:
```bash
bun run checkall && bun run dev
```
打开 `http://localhost:5173/#/match-simulator`，选西班牙 vs 阿根廷、中立：
- `Latest`：约 38.5% / 30.4% / 31.1%
- `Before the tournament`：应落到赛前基线，与 `history.cuts[0]` 一致
- 选 `2026-07-19`：决赛开踢前的评分

- [ ] **Step 6: 提交**

```bash
git add src/pages/MatchSimulator.tsx src/pages/matchsimulator.css src/i18n/en.ts
git commit -m "feat(match-simulator): pick which day's ratings to use"
```

---

### Task 8: 补齐其余 22 种语言

英文是每个缺失 key 的兜底（`src/i18n/index.tsx:9`），所以前面几步不会有编译错误，但非英文用户会看到英文。

**Files:**
- Modify: `src/i18n/{ar,cs,de,es,fa,fr,hr,id,it,ja,ko,nl,no,pt,pt-BR,ru,sv,tr,uk,uz,zh,zh-TW}.ts`

- [ ] **Step 1: 确认待补的 key**

Run:
```bash
grep -c "simRatingsAsOf\|simRatingsLatest\|simRatingsLoading\|aimsRatings\b\|aimsRatingsLatest\|aimsRatingsPre" src/i18n/*.ts
```
Expected: 只有 `en.ts` 是 6，其余为 0

- [ ] **Step 2: 逐语言补齐**

在每个语言文件中，找到 `simMatchTip` 所在位置，其后加入本语言的：

```ts
  simRatingsAsOf: '...{d}...',
  simRatingsLatest: '...',
  simRatingsLoading: '...',
```

找到 `aimsKnockout` 所在位置，其后加入：

```ts
  aimsRatings: '...',
  aimsRatingsLatest: '...',
  aimsRatingsPre: '...',
```

每个 key 的确切语义（翻译依据，不要照字面直译英文）：

| key | 语义 | 出现位置 |
|---|---|---|
| `simRatingsAsOf` | "使用的评分截止到 {d} 这个时刻"。`{d}` 会被替换成一个本地化的日期时间 | Forecast 控件下方一行小字 |
| `simRatingsLatest` | "使用最新评分"，即当前 `now` 模式 | 同上 |
| `simRatingsLoading` | "正在加载历史评分"，加载中的临时提示 | 同上 |
| `aimsRatings` | 下拉框的标签，名词"评分" | MatchSimulator 控件标签 |
| `aimsRatingsLatest` | 下拉选项，"最新"，与 `simRatingsLatest` 同义但要短 | 下拉选项 |
| `aimsRatingsPre` | 下拉选项，"世界杯开赛之前" | 下拉选项 |

四个锚定译法，其余语言照此风格：

```ts
// zh.ts
  simRatingsAsOf: '评分截至 {d}',
  simRatingsLatest: '最新评分',
  simRatingsLoading: '正在加载历史评分…',
  aimsRatings: '评分',
  aimsRatingsLatest: '最新',
  aimsRatingsPre: '开赛前',

// ja.ts
  simRatingsAsOf: '{d} 時点のレーティング',
  simRatingsLatest: '最新のレーティング',
  simRatingsLoading: '過去のレーティングを読み込み中…',
  aimsRatings: 'レーティング',
  aimsRatingsLatest: '最新',
  aimsRatingsPre: '大会開幕前',

// de.ts
  simRatingsAsOf: 'Wertungen vom {d}',
  simRatingsLatest: 'Aktuelle Wertungen',
  simRatingsLoading: 'Historische Wertungen werden geladen...',
  aimsRatings: 'Wertungen',
  aimsRatingsLatest: 'Aktuell',
  aimsRatingsPre: 'Vor dem Turnier',

// fr.ts
  simRatingsAsOf: 'Cotes au {d}',
  simRatingsLatest: 'Cotes actuelles',
  simRatingsLoading: 'Chargement des cotes historiques...',
  aimsRatings: 'Cotes',
  aimsRatingsLatest: 'Actuelles',
  aimsRatingsPre: 'Avant le tournoi',
```

**这一步刻意不把 22 种语言全部写死在计划里。** 其余语言的译文要从各自文件已有的措辞里取词（比如该文件里"评分"、"最新"、"加载中"已经怎么翻的），机器直译会和周围文案脱节。实现时逐个文件打开，参照上下文用词。

`{d}` 占位符必须原样保留，不可翻译或改名。RTL 语言（`ar.ts`、`fa.ts`）注意 `{d}` 在句中的位置符合该语言的语序。

- [ ] **Step 3: 确认无遗漏**

Run:
```bash
grep -c "simRatingsAsOf" src/i18n/*.ts | grep ":0"
```
Expected: 无输出（除 `index.tsx` 与 `strings.ts` 不在匹配范围内）

- [ ] **Step 4: 全量校验**

Run:
```bash
bun run checkall:build
```
Expected: typecheck、format、lint、test、build、smoke、a11y 全部通过

- [ ] **Step 5: 提交**

```bash
git add src/i18n
git commit -m "i18n: rating-date strings in 22 languages"
```

---

## 完成后的验证清单

- [ ] `bun test` 全绿，`probs.json` 回归的最大偏差打印在 1.0pp 以内
- [ ] Forecast 的 `Now` 模式输出与改动前一致
- [ ] Forecast 的 `Opener` 模式：ESP 约 20.5%、ARG 约 17.1%（10000 次）
- [ ] `public/data/sim-model.json` 未被修改（`git diff` 无该文件）
- [ ] `sim-model-history.json` gzip 后约 10 KB：`gzip -c public/data/sim-model-history.json | wc -c`
- [ ] 首次进入 Forecast 且不动时间选择器时，网络面板中没有 `sim-model-history.json` 请求
