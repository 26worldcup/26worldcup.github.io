#!/usr/bin/env node
/**
 * Headless smoke test: visits every route, captures console/page errors,
 * takes desktop + mobile screenshots into /tmp/wc-shots/.
 * Usage: bun scripts/smoke.mjs [baseUrl]   (default http://localhost:4173/)
 */
import puppeteer from 'puppeteer-core'
import fs from 'node:fs/promises'

const BASE = process.argv[2] || 'http://localhost:4173/'
const SHOTS = '/tmp/wc-shots'
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome'

const ROUTES = [
  ['home', '#/'],
  ['groups', '#/groups'],
  ['bracket', '#/bracket'],
  ['teams', '#/teams'],
  ['team-mex', '#/team/MEX'],
  ['team-fra', '#/team/FRA'],
  ['venues', '#/venues'],
  ['watch', '#/watch'],
  ['stats', '#/stats'],
  ['forecast', '#/forecast'],
  ['settings', '#/settings'],
  ['more', '#/more'],
  ['match-1', '#/match/400021443'],
  ['match-final', '#/match/400021543'],
]

await fs.mkdir(SHOTS, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
})

let failures = 0
for (const [mobile, vp] of [
  [false, { width: 1280, height: 900 }],
  [true, { width: 390, height: 844 }],
]) {
  const page = await browser.newPage()
  await page.setViewport(vp)
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('requestfailed', (r) => {
    const url = r.url()
    if (!url.startsWith('http://localhost')) return // external images may fail offline
    errors.push(`requestfailed: ${url} ${r.failure()?.errorText}`)
  })

  for (const [name, hash] of ROUTES) {
    errors.length = 0
    try {
      await page.goto(BASE + hash, { waitUntil: 'networkidle2', timeout: 20000 })
      await new Promise((r) => setTimeout(r, 600))
      const text = await page.evaluate(() => document.body.innerText.length)
      if (text < 100) errors.push(`page nearly empty (${text} chars)`)
      await page.screenshot({ path: `${SHOTS}/${name}${mobile ? '-m' : ''}.png` })
    } catch (e) {
      errors.push(`navigation: ${e.message}`)
    }
    if (errors.length) {
      failures++
      console.log(`FAIL ${name}${mobile ? ' [mobile]' : ''}`)
      for (const e of [...new Set(errors)].slice(0, 6)) console.log('   ', e.slice(0, 300))
    } else {
      console.log(`ok   ${name}${mobile ? ' [mobile]' : ''}`)
    }
  }
  await page.close()
}

// language/theme spot checks (zh dark, fr light)
for (const [tag, lang, theme, routes] of [
  ['zh-dark', 'zh', 'dark', ['home', 'match-1', 'groups', 'team-fra', 'settings', 'bracket']],
  ['fr', 'fr', 'light', ['home', 'watch', 'venues']],
  ['ar', 'ar', 'light', ['home', 'matches', 'match-1', 'bracket', 'settings', 'teams']],
  ['ja', 'ja', 'light', ['home', 'match-1', 'groups']],
  ['fa', 'fa', 'light', ['home', 'match-1', 'settings']],
  ['zh-TW', 'zh-TW', 'light', ['home', 'groups']],
  ['pt', 'pt', 'light', ['match-1']],
  ['ru', 'ru', 'light', ['home']],
  ['uk', 'uk', 'light', ['groups']],
  ['es', 'es', 'dark', ['home', 'bracket']],
  ['de', 'de', 'light', ['matches']],
]) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  await page.evaluateOnNewDocument(
    (l, th) => {
      localStorage.setItem('wc2026-settings', JSON.stringify({ lang: l, theme: th }))
    },
    lang,
    theme,
  )
  for (const name of routes) {
    const hash = ROUTES.find(([n]) => n === name)?.[1]
    if (!hash) continue
    errors.length = 0
    await page.goto(BASE + hash, { waitUntil: 'networkidle2', timeout: 20000 })
    await new Promise((r) => setTimeout(r, 600))
    await page.screenshot({ path: `${SHOTS}/${name}-${tag}.png` })
    if (errors.length) {
      failures++
      console.log(`FAIL ${name}-${tag}:`, errors[0])
    } else console.log(`ok   ${name}-${tag}`)
  }
  await page.close()
}

await browser.close()

// data contract: the forecast history must cover every played match
{
  const hist = JSON.parse(await fs.readFile('public/data/sim-model-history.json', 'utf8'))
  const { matches } = JSON.parse(await fs.readFile('public/data/matches.json', 'utf8'))
  const played = matches.filter(
    (m) => m.status === 'finished' && m.home?.score != null && m.away?.score != null,
  ).length
  const problems = []
  if (hist.cuts.length !== played + 1) problems.push(`cuts ${hist.cuts.length} != played+1 ${played + 1}`)
  if (hist.cuts[0].after !== null) problems.push('cuts[0].after must be null')
  for (const cut of hist.cuts) {
    if (Object.keys(cut.teams).length !== 48)
      problems.push(`cut ${cut.n} has ${Object.keys(cut.teams).length} teams`)
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

console.log(failures ? `\n${failures} route(s) with problems` : '\nall routes clean')
process.exit(failures ? 1 : 0)
