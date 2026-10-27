# Zürich Tram Atlas

A minimal, interactive learning map of Zurich's tram network.

**App:** https://zurich-tram-atlas.ralfboltshauser.com

## Explore

- Select one of 15 tram lines and choose its direction.
- Follow ordered stops on the map with previous/next controls.
- Search 178 stops and relevant streets locally.
- Hide stop names to practise recall.
- Explore a seven-point example learning path via Bellevue, Kreuzplatz and Römerhof to Kunsthaus.
- Share a link to a selected line, stop, street or learning path.
- Install from the browser menu and use offline after **Offline bereit** appears.

The phone layout has an expandable bottom panel. The desktop layout places the same controls beside the map. No account, database, paid map API or runtime third-party map requests are required.

## Data and limitations

The map bundles official canton Zurich route, stop, street and water geometry. Route data's internal update field is **17 December 2025**. Present-day operational validity is not confirmed. This is a learning map, not an operational routing authority.

The example learning path follows published service segments. Its direction change at Römerhof and operational validity are **not reviewed**. No approved diversions, automatic routing or live disruption information are provided. These limitations are visible in the app.

Internal service identifiers 50/51 are omitted rather than mapped speculatively to passenger lines. Segments incident to unnamed operating point 972 on line 10 are omitted; directions can consequently have different city endpoints. Direction sequences come from the source rather than simply reversing the stop list. Colours are orientation aids, not verified official route colours.

Sources:

- [Official route dataset](https://data.stadt-zuerich.ch/dataset/ktzh_linien_des_oeffentlichen_verkehrs__ogd_)
- [Official stop dataset](https://data.stadt-zuerich.ch/dataset/8b4d69f8-1f9b-41b9-9906-bd997ee044f8)
- [Kanton Zürich WFS](https://maps.zh.ch/wfs/OGDZHWFS)

Public geodata: CC0, Kanton Zürich / ZVV / VBZ. Inter font: OFL. MapLibre: BSD-3-Clause. Dependencies retain their respective licences.

## Development

Node.js 24 and npm:

```bash
npm ci
npm run dev
```

Open the printed localhost URL. The app is served at the domain root.

```bash
npm run build
npm run preview
```

The static output is `dist/`. App code, map worker, font and data are hosted together. A service worker caches the complete bundle. Browser storage can be evicted; the first load and updates need a network connection.

### Rebuild map data

The published data files are committed, so GIS tools and WFS access are not needed for normal builds.

To regenerate them with Python 3.12+ and [uv](https://docs.astral.sh/uv/):

```bash
uv venv .venv
uv pip install --python .venv/bin/python requests shapely
npm run data:build
npm run build
```

`scripts/build-data.py` documents source filtering, coordinate precision, sequence-continuity checks and omissions. Raw downloads are cached in ignored `scripts/raw/`; move them aside before refreshing. Updating source data does not establish operational review: inspect geometry, dates and directions before publishing.

## E2E tests

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

The suite runs desktop and touch-phone Chromium projects. It covers map rendering, route directions, stepping, recall, stop/street search, deep links, browser Back, sharing, offline reload/search, failed-data recovery, storage denial, renderer fallback and axe accessibility scans across the main screens.

To test a deployment instead of the local build:

```bash
ATLAS_URL=https://zurich-tram-atlas.ralfboltshauser.com npm run test:e2e
```

Reports, traces and screenshots are generated locally and excluded from Git. Automated phone emulation does not replace real-device testing.

## Deployment

This repository is connected to the Vercel project `zurich-tram-atlas`. Production is deployed by Vercel’s GitHub integration: pushes to `main` deploy production, and other branches use preview deployments. The Vercel CLI configures the project and domain; publishing a change is a normal Git push. Vercel uses Node.js 24, runs `npm run build` and serves `dist/`. The custom production domain is `zurich-tram-atlas.ralfboltshauser.com`.

`vercel.json` specifies the static build and prevents long-lived caching of the service worker and web app manifest. App updates are offered through an explicit update prompt.
