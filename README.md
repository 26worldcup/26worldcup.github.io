# [2026 World Cup Open Source Companion ⚽](https://26worldcup.github.io)

Clean and complete 2026 FIFA World Cup companion: schedule, groups, bracket, squads, venues, weather, where to watch, match win **probabilities** and tournament **forecast**, in 23 languages.

👉 **[Click me to use 2026 World Cup Open Source Companion now!](https://26worldcup.github.io)** ⚽ ([26worldcup.github.io](https://26worldcup.github.io))

Faster, simpler, easier way to look things up than FIFA&#46;com, Google or Wikipedia: every fact about the tournament is one or two taps away, in your language and your time zone, with nothing you don't need (no ads, no news feeds, no videos, no cookie banners, no sign-in).

> **Unofficial, fan-made, not-for-profit, open-source project**, hosted on GitHub Pages. Not affiliated with, endorsed by, or connected to FIFA, any national football association, team, player, or broadcaster. Code and curated data are MIT-licensed (see [LICENSE](LICENSE.md)); third-party data terms are inventoried in [COPYRIGHT](COPYRIGHT.md).

README in [français](README.fr.md) · [中文](README.zh.md)

## ✨ Features

### 🏆 Tournament

- 📅 **All 104 matches** with kick-off times, stadiums, group/stage chips, and semi-live scores
- 🔍 **Schedule** filterable by team(s), stage, and venue; filters live in the URL, so views are shareable
- 📊 **Group tables** computed with the official FIFA tiebreakers, plus the ranking of third-placed teams (top 8 of 12 advance) with qualification colour-coding
- 🪜 **Knockout bracket** as a centre-converging tree that fills in automatically as teams qualify, with no horizontal scrolling; reflows to a round-by-round list on phones
- 📋 **Match pages**: venue facts, win/draw/loss **probabilities**, kick-off weather forecast (typical-climate fallback for far-off dates), full referee crew, starting line-ups drawn on an SVG pitch with formations, goal timeline, and TV channels for your country

### 👕 Teams & players

- 🧢 **48 team pages**: live FIFA ranking, coach, group table, full fixtures, training base camp (with map + Google Maps links), official website, and Wikipedia links
- 👥 **Official 26-player squads**: numbers, positions, ages, caps, goals, clubs; every player links to their English Wikipedia article
- ⭐ **Favorites**: star the teams you follow and filter the schedule to them

### 🗺️ Venues & maps

- 🌎 **Real-geography map** of all 16 stadiums (Natural Earth data, Lambert conformal conic projection) with capacity, roof type, time zone, and June/July climate for every venue
- 🏕️ **Team base camps** plotted on the same map as flag pins (collision-free layout), with a team filter that highlights only the cities where a selected team plays

### 📺 Watching

- 📡 **Broadcast guide for 32 countries/regions** with free-to-air channels highlighted; your country is auto-detected from the device time zone (changeable in Settings)

### 📊 Stats & predictions

- 👟 **Golden-boot table** and tournament stats, updated throughout the competition
- 🎲 **Match probabilities & tournament forecast**: every fixture gets a win/draw/loss **probability** from an Elo model replayed over 49,000 historical internationals blended with the official FIFA ranking, and the **forecast** page lets you **simulate** the whole tournament (group tables, knockout bracket, extra time, penalty shoot-outs) 1 to 10,000 times, starting from now, the opening match, a date, or any match number, **using the ratings as they stood at that moment** so replaying from the opener carries no hindsight, then shows not just each team's title odds but a full **outcome table**: how every team finishes its group, the round it bows out in, and its final placing, all the way to the trophy, like a fun **prediction** machine

### 🌍 Languages

- **23 languages**, covering the languages of all participating teams plus some popular ones: English · Français · Español · Português (Portugal) · Português (Brasil) · Deutsch · Nederlands · Čeština · Hrvatski · Svenska · Norsk · العربية · فارسی · Türkçe · Oʻzbekcha · 日本語 · 한국어 · 简体中文 · 繁體中文 · Italiano · Bahasa Indonesia · Русский · Українська
- Automatic detection and full RTL support for Arabic and Persian
- Team, stadium, and referee names are additionally served in FIFA's own localisation for 12 of these languages; the rest fall back to English names while the interface stays translated. The language can be switched any time from the header; dictionaries load on demand

### 🎁 Experience

- 🕒 **Time zones**: match times default to *your* clock; switch to stadium-local time or any fixed zone (the host-anchor default is America/New_York)
- 📲 **PWA**: installable on desktop and mobile, works fully offline after the first visit (everything except live score refreshes)
- 📆 **Calendar export**: download an `.ics` file of your teams' matches
- 🌗 **Light & dark themes**, automatic by default
- 🔒 **Self-contained**: flags, fonts, map data, and all tournament data are served locally; the app makes **zero third-party requests** at runtime

## 📱 Compatibility

- **Screens**: responsive from small phones (360 px) to large desktops; bottom tab bar on mobile, full navigation on desktop
- **Browsers**: current Chrome, Edge, Firefox, and Safari (desktop and iOS)
- **Install**: as a PWA from the browser menu on Android, iOS ("Add to Home Screen"), and desktop Chrome/Edge
- **Accessibility**: keyboard-navigable controls, visible focus states, WCAG AA contrast in both themes, `prefers-reduced-motion` respected

## ⚡ Data: fresh after every match

> **The final was played on 19 July 2026, so the data no longer updates automatically.** The CI schedule is disabled; `update-data.yml` runs on manual dispatch only. Everything below describes how the pipeline ran during the tournament, and how it runs if you trigger it yourself.

All data comes from free, authoritative sources, with no API keys anywhere:

| Source | Provides |
|---|---|
| FIFA public API | fixtures, scores, line-ups, referees, localized names, world ranking |
| Wikipedia | official 26-player squads (numbers, caps, goals, clubs, coaches) |
| Open-Meteo | hourly stadium weather forecasts and base-camp geocoding |
| martj42/international_results (CC0) | historical results feeding the Elo win-probability model |
| Hand-curated files | venues, broadcasters, base camps, climate normals, team colours |

**Automatic updates** (GitHub Actions, included in this repo):

- ⏱️ **every 15 minutes while matches were being played** (plus a line-ups pull 10 minutes before each kick-off)
- 🌙 **one off-peak full refresh a day**
- ✅ every update is sanity-checked before publishing and triggers a site redeploy

Scores are **semi-live, not real-time**: they typically trail the broadcast by up to ~15 minutes. This is by design; the whole app is static JSON refreshed by CI, with no servers, sockets or push infrastructure.

## 🛠️ Development

For developers of this project.

### 🚀 Quick start

```bash
bun install
bun run update   # fetch the latest data
bun run dev      # http://localhost:5173
```

Production build (fully static output in `dist/`):

```bash
bun run build
bun run preview
```

### 📜 Scripts

| Script | What it does |
|---|---|
| `bun run dev` | Vite dev server at `localhost:5173` |
| `bun run build` | type-check and production build into `dist/` |
| `bun run preview` | serve the built `dist/` locally |
| `bun run update` | refresh all tournament data (FIFA, Wikipedia, Open-Meteo) into `public/data/` |
| `bun run gencron` | regenerate the CI cron schedule from the match calendar (unused, see Deploying) |
| `bun run genmap` | rebuild the venues map from Natural Earth source data |
| `bun run typecheck` | TypeScript type check (`tsc -b`, no emit) |
| `bun run format` | Biome auto-format (writes) |
| `bun run lint` | Biome lint + format check (includes a11y rules) |
| `bun run smoke` | headless smoke test: every route across languages and themes |
| `bun run a11y` | axe-core WCAG A/AA audit: routes × light/dark × RTL |
| `bun run test` | Bun test runner: data-pipeline and forecast-lookup checks |
| `bun run checkall` | quick gate: typecheck + format + lint + test |
| `bun run checkall:build` | full gate: checkall + build + smoke + a11y |

<details>
<summary><b>🌐 Adding a language</b></summary>

1. Create `src/i18n/<code>.ts` with every key from `en.ts`, same order (plus `key#one`-style plural variants where the grammar needs them).
2. Wire it: `Lang` union in `types.ts`; `LOCALE_TAG` + `LANG_LABEL` in `i18n/strings.ts` (key order = menu order); loader in `i18n/index.tsx`; detection prefix in `SettingsContext.tsx`; `RTL_LANGS` / `DATA_FALLBACK` if applicable.
3. If `api.fifa.com` serves the language, add it to `LANGS` in `scripts/update.mjs`; otherwise add it to `CLDR_LANGS` there (team names then come from CLDR country names) and add England/Scotland to `team-names-l10n.json` — they are GB subdivisions CLDR cannot name.
4. Translate the curated bits: 16 `rainNote` entries (`climate.json`), 90 broadcaster notes (`broadcasters.json`), the SF Bay Area label (`Venues.tsx`), 16 city names (`city-l10n.json`, non-Latin scripts only), and a full 48-name block in `team-names-l10n.json` only if local naming conventions differ from CLDR (as Traditional Chinese does).
5. Add a smoke pass, update this README's language list, run `bun run update && bun run build && bun run smoke`.

</details>

### 🚢 Deploying

The app is a static site with hash routing and relative asset paths. For GitHub Pages:

1. Push to the repository.
2. `deploy.yml` builds and publishes on every push to `main` (documentation-only and pipeline-only changes are skipped).
3. `update-data.yml` refreshes the data and redeploys. Its schedule is commented out now that the tournament is over, so it runs only when dispatched manually. Re-enabling it means uncommenting the `schedule:` block and reading the note above the daily cron there: the workflow wakes on a coarse grid and `scripts/cron-guard.mjs` decides whether to proceed, because GitHub silently drops entries from long schedule lists.

### 🐳 Docker (self-hosting)

A small image (nginx serving the built PWA) published to **`ghcr.io/26worldcup/26worldcup`**. Where it reads match data is set by the `DATA_SOURCE` env var; the app is served at **http://localhost:8080** either way.

| `DATA_SOURCE` | `/data/*.json` from | Freshness | Network |
| --- | --- | --- | --- |
| `remote` *(default)* | reverse-proxied from the live site | always current, incl. live scores | outbound to `REMOTE_DATA_HOST` |
| `self` | an updater sidecar that runs the data pipeline | near-live (own `UPDATE_INTERVAL`) | outbound to FIFA/Wikipedia/Open-Meteo |

#### 1. `remote` mode (default): always-fresh data proxied from the live site

**1.1 Use the prebuilt image** (no clone):

```bash
docker run -d -p 8080:80 ghcr.io/26worldcup/26worldcup:latest
```

**1.2 Build your own** (local changes, or before an image is published):

```bash
git clone https://github.com/26worldcup/26worldcup.github.io.git
cd 26worldcup.github.io
docker build -t ghcr.io/26worldcup/26worldcup:latest .          # build the local image
docker run -d -p 8080:80 ghcr.io/26worldcup/26worldcup:latest   # same tag → runs your build, no pull
```

#### 2. `self` mode: self-updating, no dependency on the live site

Two containers share a volume: the web server (`DATA_SOURCE=self`) and an updater that re-runs the data pipeline every `UPDATE_INTERVAL` seconds (default `900` = 15 min). The volume is seeded from the image's baked snapshot, so the site works immediately and is replaced by fresh data after the first run.

**2.1 Use the prebuilt images** (no clone), run the pair directly:

```bash
docker volume create wc-data
docker run -d -p 8080:80 -e DATA_SOURCE=self --restart unless-stopped \
  -v wc-data:/usr/share/nginx/html/data \
  ghcr.io/26worldcup/26worldcup:latest
docker run -d -e UPDATE_INTERVAL=900 --restart unless-stopped \
  -v wc-data:/app/public/data \
  ghcr.io/26worldcup/26worldcup-updater:latest
```

**2.2 Build your own** (Compose builds both the web and updater images):

```bash
git clone https://github.com/26worldcup/26worldcup.github.io.git
cd 26worldcup.github.io
docker compose -f docker-compose.yml -f docker-compose.self.yml up -d --build
```

### ⚙️ Tech

React 19 · TypeScript · Vite · no backend, no runtime dependencies beyond React + Router. SVG throughout: the pitch with line-ups, the projected North America map, the bracket, the logo.

```
scripts/update.mjs    data pipeline (bun run update)
scripts/gencron.mjs   regenerates the match-driven CI schedule (unused: see Deploying)
scripts/simhistory.mjs per-match Elo snapshots for the historical forecast
scripts/regen-history.mjs  rebuilds those snapshots offline from the cached CSV
scripts/gen-wc-history.mjs frozen World Cup history & qualification data
scripts/genmap.mjs    rebuilds the map from Natural Earth data
scripts/smoke.mjs     headless smoke test across routes, languages, themes
scripts/curated/      hand-checked datasets
public/data/          generated JSON the app loads at runtime
src/                  application code (pages, components, i18n, settings)
```

## 📄 License

Code and curated data: [MIT](LICENSE.md). Detailed third-party data and image licensing: [COPYRIGHT](COPYRIGHT.md). Data courtesy of FIFA's public API, Wikipedia, and Open-Meteo; verify broadcast rights with local listings.
