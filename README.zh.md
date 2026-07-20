# [2026 世界杯开源助手 ⚽](https://26worldcup.github.io)

简洁而完整的 2026 国际足联世界杯助手：赛程、小组、对阵图、参赛名单、球场、天气、观赛指南、比赛胜负**概率**与赛事**预测**，支持 23 种语言。

👉 **[点我立即使用 2026 世界杯开源助手！](https://26worldcup.github.io)** ⚽ ([26worldcup.github.io](https://26worldcup.github.io))

比起 FIFA&#46;com、Google 或维基百科，这里查信息更快、更简单、更轻松：关于这届赛事的每一条信息都只需一两下点按即可获取，以你的语言、你的时区呈现，没有任何多余的东西（无广告、无新闻流、无视频、无 Cookie 横幅、无需登录）。

> **非官方、球迷自制、非营利、开源项目**，托管于 GitHub Pages。与国际足联、任何国家足协、球队、球员或转播机构均无关联、未获其认可、也无任何关系。代码与精选数据采用 MIT 许可（见 [LICENSE](LICENSE.md)）；第三方数据条款详见 [COPYRIGHT](COPYRIGHT.md)。

其他语言的README：[English](README.md) · [français](README.fr.md)

## ✨ 功能特性

### 🏆 赛事

- 📅 **全部 104 场比赛**，含开球时间、球场、小组/阶段标签以及半实时比分
- 🔍 **赛程**可按球队、阶段和球场筛选；筛选条件保存在 URL 中，因此视图可以分享
- 📊 **小组积分榜**依据官方国际足联同分排序规则计算，并附第三名球队的排名（12 支中前 8 名晋级），用颜色标注晋级情况
- 🪜 **淘汰赛对阵图**采用向中心汇聚的树状结构，随球队晋级自动填充，无需横向滚动；在手机上则改为逐轮列表布局
- 📋 **比赛页面**：球场信息、胜/平/负**概率**、开球时段天气预报（对于较远日期则回退至典型气候数据）、完整裁判组、绘制在 SVG 球场上并标注阵型的首发阵容、进球时间轴，以及你所在国家/地区的转播频道

### 👕 球队与球员

- 🧢 **48 支球队页面**：实时国际足联排名、主教练、小组积分榜、完整赛程、训练大本营（含地图 + Google 地图链接）、官方网站及维基百科链接
- 👥 **官方 26 人参赛名单**：号码、位置、年龄、出场次数、进球数、所属俱乐部；每位球员均链接到其英文维基百科条目
- ⭐ **收藏**：为你关注的球队加星标，并据此筛选赛程

### 🗺️ 球场与地图

- 🌎 全部 16 座球场的**真实地理地图**（Natural Earth 数据，兰勃特等角圆锥投影），标注每座球场的容量、顶棚类型、时区以及六月/七月气候
- 🏕️ **球队大本营**以旗帜图钉形式标绘在同一张地图上（避免重叠的布局），并配有球队筛选功能，仅高亮显示所选球队参赛的城市

### 📺 观赛

- 📡 **覆盖 32 个国家/地区的转播指南**，并高亮标出免费收看频道；你所在的国家/地区会根据设备时区自动识别（可在设置中更改）

### 📊 数据统计与预测

- 👟 **金靴榜**及赛事数据统计，在整届比赛期间持续更新
- 🎲 **比赛概率与赛事预测**：每场比赛都会给出胜/平/负**概率**，由一个在 49,000 场历史国家队比赛上回放训练的 Elo 模型结合官方国际足联排名得出，而**预测**页面让你从现在、揭幕战、某个日期或任意一场比赛编号开始，**并使用该时点的球队评分**（因此从揭幕战重演不会带有后见之明），对整届赛事（小组积分榜、淘汰赛对阵图、加时赛、点球大战）进行 1 到 10,000 次**模拟**，然后不仅展示每支球队的夺冠概率，还提供一张完整的**结果表**：每支球队在小组中的最终排名、被淘汰的轮次以及最终名次，一路推演到捧杯，宛如一台有趣的**预测**机器

### 🌍 语言

- **23 种语言**，覆盖所有参赛球队的语言以及一些热门语言：English · Français · Español · Português (Portugal) · Português (Brasil) · Deutsch · Nederlands · Čeština · Hrvatski · Svenska · Norsk · العربية · فارسی · Türkçe · Oʻzbekcha · 日本語 · 한국어 · 简体中文 · 繁體中文 · Italiano · Bahasa Indonesia · Русский · Українська
- 对阿拉伯语和波斯语提供自动检测及完整的 RTL（从右到左）支持
- 球队、球场和裁判的名称还会以国际足联自己的本地化方式提供给其中 12 种语言；其余语言则在界面保持翻译的同时回退使用英文名称。语言可随时从顶栏切换；词典按需加载

### 🎁 体验

- 🕒 **时区**：比赛时间默认以*你的*时钟显示；可切换为球场当地时间或任意固定时区（默认锚定主办地时区 America/New_York）
- 📲 **PWA**：可安装到桌面端和移动端，首次访问后完全离线可用（除实时比分刷新外的一切功能）
- 📆 **日历导出**：下载你所关注球队比赛的 `.ics` 文件
- 🌗 **浅色与深色主题**，默认自动切换
- 🔒 **自包含**：旗帜、字体、地图数据以及所有赛事数据均本地提供；应用在运行时发出**零次第三方请求**

## 📱 兼容性

- **屏幕**：从小屏手机（360 px）到大屏桌面均自适应；移动端使用底部标签栏，桌面端则为完整导航
- **浏览器**：最新版 Chrome、Edge、Firefox 和 Safari（桌面端及 iOS）
- **安装**：可在 Android、iOS（"添加到主屏幕"）以及桌面版 Chrome/Edge 上从浏览器菜单作为 PWA 安装
- **无障碍**：支持键盘导航的控件、可见的焦点状态、两种主题下均达到 WCAG AA 对比度，并遵循 `prefers-reduced-motion` 设置

## ⚡ 数据：每场比赛后即时更新

> **决赛已于 2026 年 7 月 19 日结束，数据不再自动更新。** CI 定时调度已停用，`update-data.yml` 仅在手动触发时运行。下文描述的是赛事期间管线的运行方式，以及你自行触发时的行为。

所有数据均来自免费、权威的来源，且全程不使用任何 API 密钥：

| 来源 | 提供内容 |
|---|---|
| FIFA 公开 API | 赛程、比分、阵容、裁判、本地化名称、世界排名 |
| 维基百科 | 官方 26 人参赛名单（号码、出场次数、进球数、俱乐部、主教练） |
| Open-Meteo | 逐小时球场天气预报及大本营地理编码 |
| martj42/international_results (CC0) | 为 Elo 胜负概率模型提供数据的历史比赛结果 |
| 手工精选文件 | 球场、转播机构、大本营、气候常年值、球队配色 |

**自动更新**（GitHub Actions，已包含在本仓库中）：

- ⏱️ **比赛进行期间每 15 分钟一次**（外加每场比赛开球前 10 分钟拉取一次阵容）
- 🌙 **每天一次错峰全量刷新**
- ✅ 每次更新在发布前都会经过合理性校验，并触发站点重新部署

比分为**半实时，而非实时**：通常比转播信号滞后最多约 15 分钟。这是有意为之；整个应用是由 CI 刷新的静态 JSON，没有服务器、套接字或推送基础设施。

## 🛠️ 开发

面向本项目的开发者。

### 🚀 快速开始

```bash
bun install
bun run update   # fetch the latest data
bun run dev      # http://localhost:5173
```

生产构建（在 `dist/` 中生成完全静态的输出）：

```bash
bun run build
bun run preview
```

### 📜 脚本

| 脚本 | 作用 |
|---|---|
| `bun run dev` | 在 `localhost:5173` 启动 Vite 开发服务器 |
| `bun run build` | 类型检查并构建生产版本到 `dist/` |
| `bun run preview` | 在本地提供已构建的 `dist/` |
| `bun run update` | 将所有赛事数据（FIFA、维基百科、Open-Meteo）刷新到 `public/data/` |
| `bun run gencron` | 根据比赛日历重新生成 CI cron 调度计划（已弃用，见「部署」一节） |
| `bun run genmap` | 从 Natural Earth 源数据重建球场地图 |
| `bun run typecheck` | TypeScript 类型检查（`tsc -b`，不产出文件） |
| `bun run format` | Biome 自动格式化（写入） |
| `bun run lint` | Biome lint + 格式检查（包含无障碍规则） |
| `bun run smoke` | 无头冒烟测试：覆盖所有语言和主题下的每条路由 |
| `bun run a11y` | axe-core WCAG A/AA 审计：路由 × 浅色/深色 × RTL |
| `bun run test` | Bun 测试运行器：数据管线与预测切点查找的校验 |
| `bun run checkall` | 快速校验：typecheck + format + lint + test |
| `bun run checkall:build` | 完整校验：checkall + build + smoke + a11y |

<details>
<summary><b>🌐 添加一种语言</b></summary>

1. 创建 `src/i18n/<code>.ts`，包含 `en.ts` 中的每一个键，顺序相同（在语法需要时再加上 `key#one` 风格的复数变体）。
2. 接入它：`types.ts` 中的 `Lang` 联合类型；`i18n/strings.ts` 中的 `LOCALE_TAG` + `LANG_LABEL`（键的顺序 = 菜单顺序）；`i18n/index.tsx` 中的加载器；`SettingsContext.tsx` 中的检测前缀；以及在适用时的 `RTL_LANGS` / `DATA_FALLBACK`。
3. 如果 `api.fifa.com` 提供该语言，就将其加入 `scripts/update.mjs` 中的 `LANGS`；否则将其加入那里的 `CLDR_LANGS`（球队名称随后会来自 CLDR 国家名称），并将 England 和 Scotland 添加到 `team-names-l10n.json` —— 它们是 CLDR 无法命名的英国行政区。
4. 翻译精选内容：16 条 `rainNote` 条目（`climate.json`）、90 条转播机构备注（`broadcasters.json`）、旧金山湾区标签（`Venues.tsx`）、16 个城市名称（`city-l10n.json`，仅限非拉丁文字），以及仅在本地命名习惯与 CLDR 不同时（如繁体中文）才需要的完整 48 个球队名称区块（`team-names-l10n.json`）。
5. 添加一次冒烟测试，更新本 README 的语言列表，并运行 `bun run update && bun run build && bun run smoke`。

</details>

### 🚢 部署

本应用是一个采用 hash 路由和相对资源路径的静态站点。对于 GitHub Pages：

1. 推送到仓库。
2. `deploy.yml` 会在每次推送到 `main` 时构建并发布（仅涉及文档和仅涉及流水线的改动会被跳过）。
3. `update-data.yml` 负责刷新数据并重新部署。赛事结束后其定时调度已被注释掉，只能手动触发。若要重新启用，取消 `schedule:` 块的注释，并阅读那里每日 cron 上方的说明：GitHub 会静默丢弃过长 schedule 列表中的条目，因此该工作流按粗网格唤醒，再由 `scripts/cron-guard.mjs` 决定是否继续。

### 🐳 Docker（自托管）

一个小巧的镜像（由 nginx 提供已构建的 PWA），发布于 **`ghcr.io/26worldcup/26worldcup`**。它从何处读取比赛数据由 `DATA_SOURCE` 环境变量决定；无论哪种方式，应用都在 **http://localhost:8080** 上提供服务。

| `DATA_SOURCE` | `/data/*.json` 来自 | 时效性 | 网络 |
| --- | --- | --- | --- |
| `remote` *（默认）* | 从在线站点反向代理 | 始终最新，含实时比分 | 向 `REMOTE_DATA_HOST` 发出出站请求 |
| `self` | 运行数据流水线的更新器边车容器 | 接近实时（由自身的 `UPDATE_INTERVAL` 决定） | 向 FIFA/维基百科/Open-Meteo 发出出站请求 |

#### 1. `remote` 模式（默认）：从在线站点代理的始终最新的数据

**1.1 使用预构建镜像**（无需克隆）：

```bash
docker run -d -p 8080:80 ghcr.io/26worldcup/26worldcup:latest
```

**1.2 自行构建**（有本地改动，或在镜像发布之前）：

```bash
git clone https://github.com/26worldcup/26worldcup.github.io.git
cd 26worldcup.github.io
docker build -t ghcr.io/26worldcup/26worldcup:latest .          # 构建本地镜像
docker run -d -p 8080:80 ghcr.io/26worldcup/26worldcup:latest   # 相同标签 → 运行你的构建，不会拉取
```

#### 2. `self` 模式：自我更新，不依赖在线站点

两个容器共享一个数据卷：Web 服务器（`DATA_SOURCE=self`）和一个每隔 `UPDATE_INTERVAL` 秒（默认 `900` = 15 分钟）重新运行数据流水线的更新器。该数据卷以镜像中预置的快照作为初始内容，因此站点可立即工作，并在首次运行后被最新数据替换。

**2.1 使用预构建镜像**（无需克隆），直接运行这一对容器：

```bash
docker volume create wc-data
docker run -d -p 8080:80 -e DATA_SOURCE=self --restart unless-stopped \
  -v wc-data:/usr/share/nginx/html/data \
  ghcr.io/26worldcup/26worldcup:latest
docker run -d -e UPDATE_INTERVAL=900 --restart unless-stopped \
  -v wc-data:/app/public/data \
  ghcr.io/26worldcup/26worldcup-updater:latest
```

**2.2 自行构建**（Compose 会同时构建 Web 镜像和更新器镜像）：

```bash
git clone https://github.com/26worldcup/26worldcup.github.io.git
cd 26worldcup.github.io
docker compose -f docker-compose.yml -f docker-compose.self.yml up -d --build
```

### ⚙️ 技术栈

React 19 · TypeScript · Vite · 无后端，除 React + Router 外无任何运行时依赖。全程使用 SVG：含首发阵容的球场、投影后的北美地图、对阵图、Logo。

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

## 📄 许可

代码与精选数据：[MIT](LICENSE.md)。详细的第三方数据与图像许可：[COPYRIGHT](COPYRIGHT.md)。数据由国际足联公开 API、维基百科及 Open-Meteo 提供；请通过当地节目单核实转播权。
