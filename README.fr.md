# [Compagnon Open Source de la Coupe du Monde 2026 ⚽](https://26worldcup.github.io)

Compagnon clair et complet de la Coupe du Monde de la FIFA 2026 : calendrier, groupes, tableau final, effectifs, stades, météo, où regarder les matchs, **probabilités** de victoire et **prévisions** du tournoi, en 23 langues.

👉 **[Cliquez ici pour utiliser dès maintenant le Compagnon Open Source de la Coupe du Monde 2026 !](https://26worldcup.github.io)** ⚽ ([26worldcup.github.io](https://26worldcup.github.io))

Une façon plus rapide, plus simple et plus facile de chercher des informations que sur FIFA&#46;com, Google ou Wikipédia : chaque fait sur le tournoi est à une ou deux pressions de doigt, dans votre langue et votre fuseau horaire, sans rien dont vous n'avez pas besoin (pas de publicités, pas de fils d'actualité, pas de vidéos, pas de bandeaux de cookies, pas de connexion).

> **Projet non officiel, créé par des fans, à but non lucratif et open source**, hébergé sur GitHub Pages. Sans affiliation, approbation ni lien avec la FIFA, une quelconque association nationale de football, équipe, joueur ou diffuseur. Le code et les données organisées sont sous licence MIT (voir [LICENSE](LICENSE.md)) ; les conditions des données tierces sont répertoriées dans [COPYRIGHT](COPYRIGHT.md).

README en [English](README.md) · [中文](README.zh.md)

## ✨ Fonctionnalités

### 🏆 Tournoi

- 📅 **Les 104 matchs** avec heures de coup d'envoi, stades, étiquettes de groupe/phase et scores semi-en-direct
- 🔍 **Calendrier** filtrable par équipe(s), phase et stade ; les filtres vivent dans l'URL, donc les vues sont partageables
- 📊 **Classements des groupes** calculés avec les critères de départage officiels de la FIFA, plus le classement des troisièmes (les 8 meilleurs sur 12 se qualifient) avec un code couleur de qualification
- 🪜 **Tableau final à élimination directe** sous forme d'arbre convergeant vers le centre qui se remplit automatiquement à mesure que les équipes se qualifient, sans défilement horizontal ; se réorganise en une liste tour par tour sur téléphone
- 📋 **Pages des matchs** : informations sur le stade, **probabilités** de victoire/nul/défaite, prévisions météo pour le coup d'envoi (repli sur le climat typique pour les dates lointaines), équipe arbitrale complète, compositions de départ dessinées sur un terrain SVG avec les formations, chronologie des buts et chaînes de télévision pour votre pays

### 👕 Équipes et joueurs

- 🧢 **48 pages d'équipes** : classement FIFA en direct, sélectionneur, classement du groupe, calendrier complet, camp de base d'entraînement (avec carte + liens Google Maps), site officiel et liens Wikipédia
- 👥 **Effectifs officiels de 26 joueurs** : numéros, postes, âges, sélections, buts, clubs ; chaque joueur renvoie vers son article Wikipédia en anglais
- ⭐ **Favoris** : ajoutez une étoile aux équipes que vous suivez et filtrez le calendrier pour ne voir qu'elles

### 🗺️ Stades et cartes

- 🌎 **Carte géographique réelle** des 16 stades (données Natural Earth, projection conique conforme de Lambert) avec capacité, type de toit, fuseau horaire et climat de juin/juillet pour chaque stade
- 🏕️ **Camps de base des équipes** placés sur la même carte sous forme d'épingles de drapeaux (disposition sans chevauchement), avec un filtre par équipe qui met en évidence uniquement les villes où l'équipe sélectionnée joue

### 📺 Où regarder

- 📡 **Guide de diffusion pour 32 pays/régions** avec les chaînes gratuites mises en évidence ; votre pays est détecté automatiquement à partir du fuseau horaire de l'appareil (modifiable dans les Paramètres)

### 📊 Statistiques et pronostics

- 👟 **Classement des buteurs (Soulier d'or)** et statistiques du tournoi, mis à jour tout au long de la compétition
- 🎲 **Probabilités des matchs et prévisions du tournoi** : chaque rencontre reçoit une **probabilité** de victoire/nul/défaite issue d'un modèle Elo rejoué sur 49 000 matchs internationaux historiques, combiné au classement officiel de la FIFA, et la page de **prévisions** vous permet de **simuler** l'ensemble du tournoi (classements des groupes, tableau à élimination directe, prolongations, séances de tirs au but) de 1 à 10 000 fois, en partant de maintenant, du match d'ouverture, d'une date ou d'un numéro de match quelconque, **avec les cotes telles qu'elles étaient à cet instant**, de sorte qu'un rejeu depuis le match d'ouverture ne bénéficie d'aucun recul, puis affiche non seulement les chances de titre de chaque équipe mais aussi un **tableau de résultats** complet : comment chaque équipe termine son groupe, le tour où elle est éliminée et son classement final, jusqu'au trophée, comme une amusante machine à **pronostics**

### 🌍 Langues

- **23 langues**, couvrant les langues de toutes les équipes participantes ainsi que quelques langues populaires : English · Français · Español · Português (Portugal) · Português (Brasil) · Deutsch · Nederlands · Čeština · Hrvatski · Svenska · Norsk · العربية · فارسی · Türkçe · Oʻzbekcha · 日本語 · 한국어 · 简体中文 · 繁體中文 · Italiano · Bahasa Indonesia · Русский · Українська
- Détection automatique et prise en charge complète du RTL (droite à gauche) pour l'arabe et le persan
- Les noms des équipes, des stades et des arbitres sont en outre fournis dans la localisation propre à la FIFA pour 12 de ces langues ; les autres se rabattent sur les noms en anglais tandis que l'interface reste traduite. La langue peut être changée à tout moment depuis l'en-tête ; les dictionnaires se chargent à la demande

### 🎁 Expérience

- 🕒 **Fuseaux horaires** : les heures des matchs s'affichent par défaut sur *votre* horloge ; basculez vers l'heure locale du stade ou tout fuseau fixe (le fuseau par défaut ancré sur l'hôte est America/New_York)
- 📲 **PWA** : installable sur ordinateur et mobile, fonctionne entièrement hors ligne après la première visite (tout sauf les actualisations de scores en direct)
- 📆 **Export du calendrier** : téléchargez un fichier `.ics` des matchs de vos équipes
- 🌗 **Thèmes clair et sombre**, automatiques par défaut
- 🔒 **Autonome** : les drapeaux, polices, données cartographiques et toutes les données du tournoi sont servis localement ; l'application effectue **zéro requête tierce** à l'exécution

## 📱 Compatibilité

- **Écrans** : adaptatif des petits téléphones (360 px) aux grands écrans de bureau ; barre d'onglets en bas sur mobile, navigation complète sur ordinateur
- **Navigateurs** : versions actuelles de Chrome, Edge, Firefox et Safari (bureau et iOS)
- **Installation** : en tant que PWA depuis le menu du navigateur sur Android, iOS (« Sur l'écran d'accueil ») et Chrome/Edge sur ordinateur
- **Accessibilité** : commandes navigables au clavier, états de focus visibles, contraste WCAG AA dans les deux thèmes, `prefers-reduced-motion` respecté

## ⚡ Données : fraîches après chaque match

> **La finale a eu lieu le 19 juillet 2026, les données ne se mettent donc plus à jour automatiquement.** Le planning de la CI est désactivé ; `update-data.yml` ne s'exécute plus que sur déclenchement manuel. Ce qui suit décrit le fonctionnement du pipeline pendant le tournoi, et son comportement si vous le déclenchez vous-même.

Toutes les données proviennent de sources libres et faisant autorité, sans aucune clé d'API où que ce soit :

| Source | Fournit |
|---|---|
| API publique de la FIFA | rencontres, scores, compositions, arbitres, noms localisés, classement mondial |
| Wikipédia | effectifs officiels de 26 joueurs (numéros, sélections, buts, clubs, sélectionneurs) |
| Open-Meteo | prévisions météo horaires des stades et géocodage des camps de base |
| martj42/international_results (CC0) | résultats historiques alimentant le modèle Elo de probabilité de victoire |
| Fichiers organisés à la main | stades, diffuseurs, camps de base, normales climatiques, couleurs des équipes |

**Mises à jour automatiques** (GitHub Actions, incluses dans ce dépôt) :

- ⏱️ **toutes les 15 minutes pendant que des matchs se jouent** (plus une récupération des compositions 10 minutes avant chaque coup d'envoi)
- 🌙 **une actualisation complète par jour, en heures creuses**
- ✅ chaque mise à jour est vérifiée pour cohérence avant publication et déclenche un redéploiement du site

Les scores sont **semi-en-direct, pas en temps réel** : ils accusent généralement un retard pouvant atteindre ~15 minutes par rapport à la diffusion. C'est voulu ; l'application entière est du JSON statique actualisé par la CI, sans serveurs, sockets ni infrastructure de notifications push.

## 🛠️ Développement

Pour les développeurs de ce projet.

### 🚀 Démarrage rapide

```bash
bun install
bun run update   # fetch the latest data
bun run dev      # http://localhost:5173
```

Build de production (sortie entièrement statique dans `dist/`) :

```bash
bun run build
bun run preview
```

### 📜 Scripts

| Script | Ce qu'il fait |
|---|---|
| `bun run dev` | serveur de développement Vite sur `localhost:5173` |
| `bun run build` | vérification des types et build de production dans `dist/` |
| `bun run preview` | sert localement le `dist/` compilé |
| `bun run update` | actualise toutes les données du tournoi (FIFA, Wikipédia, Open-Meteo) dans `public/data/` |
| `bun run gencron` | régénère le planning cron de la CI à partir du calendrier des matchs (inutilisé, voir Déploiement) |
| `bun run genmap` | reconstruit la carte des stades à partir des données source Natural Earth |
| `bun run typecheck` | vérification des types TypeScript (`tsc -b`, sans émission) |
| `bun run format` | formatage automatique Biome (écriture) |
| `bun run lint` | lint Biome + vérification du formatage (inclut les règles d'accessibilité) |
| `bun run smoke` | test de fumée sans interface : chaque route à travers les langues et les thèmes |
| `bun run a11y` | audit WCAG A/AA avec axe-core : routes × clair/sombre × RTL |
| `bun run test` | lanceur de tests Bun : pipeline de données et recherche de point de coupe |
| `bun run checkall` | passage rapide : typecheck + format + lint + test |
| `bun run checkall:build` | passage complet : checkall + build + smoke + a11y |

<details>
<summary><b>🌐 Ajouter une langue</b></summary>

1. Créez `src/i18n/<code>.ts` avec chaque clé de `en.ts`, dans le même ordre (plus les variantes de pluriel de style `key#one` là où la grammaire l'exige).
2. Câblez-la : l'union `Lang` dans `types.ts` ; `LOCALE_TAG` + `LANG_LABEL` dans `i18n/strings.ts` (l'ordre des clés = l'ordre du menu) ; le chargeur dans `i18n/index.tsx` ; le préfixe de détection dans `SettingsContext.tsx` ; `RTL_LANGS` / `DATA_FALLBACK` le cas échéant.
3. Si `api.fifa.com` sert la langue, ajoutez-la à `LANGS` dans `scripts/update.mjs` ; sinon ajoutez-la à `CLDR_LANGS` à cet endroit (les noms des équipes proviennent alors des noms de pays CLDR) et ajoutez l'Angleterre et l'Écosse à `team-names-l10n.json` — ce sont des subdivisions du Royaume-Uni que le CLDR ne peut pas nommer.
4. Traduisez les éléments organisés : 16 entrées `rainNote` (`climate.json`), 90 notes de diffuseurs (`broadcasters.json`), le libellé de la région de la baie de San Francisco (`Venues.tsx`), 16 noms de villes (`city-l10n.json`, scripts non latins uniquement) et un bloc complet de 48 noms dans `team-names-l10n.json` uniquement si les conventions de nommage locales diffèrent du CLDR (comme c'est le cas pour le chinois traditionnel).
5. Ajoutez un passage de test de fumée, mettez à jour la liste des langues de ce README, exécutez `bun run update && bun run build && bun run smoke`.

</details>

### 🚢 Déploiement

L'application est un site statique avec routage par hash et chemins d'actifs relatifs. Pour GitHub Pages :

1. Poussez vers le dépôt.
2. `deploy.yml` compile et publie à chaque push vers `main` (les changements purement documentaires et purement liés au pipeline sont ignorés).
3. `update-data.yml` actualise les données et redéploie. Son planning est commenté maintenant que le tournoi est terminé : il ne s'exécute plus que sur déclenchement manuel. Pour le réactiver, décommentez le bloc `schedule:` et lisez la note placée au-dessus du cron quotidien : GitHub supprime silencieusement des entrées des listes de planning trop longues, aussi le workflow se réveille sur une grille grossière et `scripts/cron-guard.mjs` décide s'il faut poursuivre.

### 🐳 Docker (auto-hébergement)

Une petite image (nginx servant la PWA compilée) publiée sur **`ghcr.io/26worldcup/26worldcup`**. L'endroit où elle lit les données des matchs est défini par la variable d'environnement `DATA_SOURCE` ; l'application est servie sur **http://localhost:8080** dans les deux cas.

| `DATA_SOURCE` | `/data/*.json` depuis | Fraîcheur | Réseau |
| --- | --- | --- | --- |
| `remote` *(par défaut)* | relayé par proxy inverse depuis le site en ligne | toujours à jour, y compris les scores en direct | sortant vers `REMOTE_DATA_HOST` |
| `self` | un conteneur secondaire de mise à jour qui exécute le pipeline de données | quasi en direct (selon son propre `UPDATE_INTERVAL`) | sortant vers FIFA/Wikipédia/Open-Meteo |

#### 1. Mode `remote` (par défaut) : données toujours fraîches relayées depuis le site en ligne

**1.1 Utiliser l'image préconstruite** (sans clonage) :

```bash
docker run -d -p 8080:80 ghcr.io/26worldcup/26worldcup:latest
```

**1.2 Construire la vôtre** (modifications locales, ou avant qu'une image ne soit publiée) :

```bash
git clone https://github.com/26worldcup/26worldcup.github.io.git
cd 26worldcup.github.io
docker build -t ghcr.io/26worldcup/26worldcup:latest .          # build l'image locale
docker run -d -p 8080:80 ghcr.io/26worldcup/26worldcup:latest   # même tag → exécute votre build, sans pull
```

#### 2. Mode `self` : auto-actualisé, sans dépendance au site en ligne

Deux conteneurs partagent un volume : le serveur web (`DATA_SOURCE=self`) et un conteneur de mise à jour qui réexécute le pipeline de données toutes les `UPDATE_INTERVAL` secondes (par défaut `900` = 15 min). Le volume est initialisé à partir de l'instantané intégré à l'image, donc le site fonctionne immédiatement et est remplacé par des données fraîches après la première exécution.

**2.1 Utiliser les images préconstruites** (sans clonage), exécuter la paire directement :

```bash
docker volume create wc-data
docker run -d -p 8080:80 -e DATA_SOURCE=self --restart unless-stopped \
  -v wc-data:/usr/share/nginx/html/data \
  ghcr.io/26worldcup/26worldcup:latest
docker run -d -e UPDATE_INTERVAL=900 --restart unless-stopped \
  -v wc-data:/app/public/data \
  ghcr.io/26worldcup/26worldcup-updater:latest
```

**2.2 Construire les vôtres** (Compose construit à la fois l'image web et celle de mise à jour) :

```bash
git clone https://github.com/26worldcup/26worldcup.github.io.git
cd 26worldcup.github.io
docker compose -f docker-compose.yml -f docker-compose.self.yml up -d --build
```

### ⚙️ Technologie

React 19 · TypeScript · Vite · pas de backend, aucune dépendance à l'exécution au-delà de React + Router. Du SVG partout : le terrain avec les compositions, la carte projetée de l'Amérique du Nord, le tableau final, le logo.

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

## 📄 Licence

Code et données organisées : [MIT](LICENSE.md). Licences détaillées des données et images tierces : [COPYRIGHT](COPYRIGHT.md). Données fournies grâce à l'API publique de la FIFA, à Wikipédia et à Open-Meteo ; vérifiez les droits de diffusion auprès des programmes locaux.
