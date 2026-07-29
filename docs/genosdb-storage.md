# GTFS index on GenosDB — migration notes & benchmarks

This branch replaces [sqlocal](https://github.com/DallasHoff/sqlocal) (SQLite
over OPFS) with [GenosDB](https://github.com/estebanrfp/gdb) as the local store
for Hōkō's GTFS index. GenosDB already powers the P2P tracking layer, so after
this change a single library covers both networking and storage.

All numbers below were measured on the real dataset — **9,783 stops, 4,359
routes, 208,229 stop↔route pairs** — on an M-series MacBook running Chromium.
Methodology at the bottom.

## What changed

| | before | after |
| --- | --- | --- |
| Local store | sqlocal (SQLite WASM + OPFS) | GenosDB instance `hoko-gtfs` (OPFS, geo module) |
| Data asset | `hoko_index.db` — 12.5 MB binary | `gtfs.json` — 2.2 MB, ~500 KB gzipped |
| Build script | `scripts/make_db.ts` | `scripts/make_seed.ts` (same cleaning logic) |
| First visit | download 12.5 MB, copy into OPFS | download ~500 KB, seed store in ~300 ms |
| Return visits | open SQLite file | open store in ~140 ms |
| COOP/COEP headers | required (SharedArrayBuffer) | not needed — `netlify.toml` removed |
| Bundle | +1.07 MB (sqlite3.wasm 860 KB + worker 209 KB) | no WASM engine |
| `dist/` total | 19 MB | 8.3 MB |

The four query functions in `src/db/queries.ts` keep their exact signatures;
no UI component changed.

## Data model

Two node types in a local-only GenosDB instance (no `rtc` — the GTFS index is
static reference data and must not sync between peers):

```
stop-{id}   → { type, sid, name, location: { latitude, longitude }, routeIds[] }
route-{id}  → { type, rid, name, full_name, direction, start, stop, stopIds[] }
gtfs-meta   → { version }   // bump SEED_VERSION in client.ts to reseed
```

The `routes_to_stops` join table becomes denormalized id arrays on both node
types. A links-based model (`db.link()`, one edge per pair) was also measured:
it works and queries fine, but seeding 208k edges takes ~4 s versus ~300 ms for
arrays, with no query-side benefit for this access pattern — so arrays won.

Queries map 1:1:

- `getClosestStops` → geo module `$bbox` (same bounding box math as before,
  via the existing `getCoordRange`)
- `getRoutesForStop` / `getStopsForRoute` → read the id array, batch `db.get`
- `getSearchedRoutes` → substring filter over the stop's routes (a stop serves
  at most a few hundred routes, so this is a `0.1 ms` in-memory filter)

## Query benchmarks

Identical inputs on both engines, results **byte-identical** on all four
queries (29 closest stops with matching ids, 143 routes for the probe stop,
73 stops for the probe route, same 10 search hits in the same order).

| query | sqlocal | GenosDB | speedup |
| --- | --- | --- | --- |
| `getClosestStops` (1 km bbox) | 29.7 ms | 6.1 ms | ~5× |
| `getRoutesForStop` (143 routes) | 15.0 ms | 0.2 ms | ~75× |
| `getStopsForRoute` (73 stops) | 11.4 ms | 0.1 ms | ~100× |
| `getSearchedRoutes` | 2.7 ms | 0.1 ms | ~27× |

## Ingestion & startup benchmarks

| phase | time |
| --- | --- |
| fetch + parse `gtfs.json` (localhost) | ~20 ms |
| seed 9,783 stops (with geo fields + routeIds) | 171 ms (~57k ops/s) |
| seed 4,359 routes (with stopIds) | 86 ms |
| **total first-visit seed** | **~300 ms** |
| warm open (14k nodes from OPFS, return visits) | ~140 ms |

The seed runs once behind the app's existing `Loading` screen and is versioned
through the `gtfs-meta` node. The legacy `hoko.sqlite` OPFS file and the
`init_db` localStorage flag are cleaned up automatically after a successful
seed.

## Why this is a win

1. **One stack** — one library for P2P and storage, one mental model, one set
   of docs. `sqlocal` and its Vite plugin are gone from the dependency tree.
2. **~25× less first-visit transfer** — 12.5 MB binary → ~500 KB gzipped JSON.
   On a mid-range phone on 4G this is the difference between ~15 s and ~1 s
   before the app is usable.
3. **No COOP/COEP** — the headers existed only for SQLite's SharedArrayBuffer.
   Dropping them removes a whole deploy footgun (AGENTS.md called it
   "breaking change if missing") and un-restricts embedding/third-party
   resources.
4. **Faster queries** — every query got faster, the hot path (`getClosestStops`
   on each GPS update) by ~5×.
5. **Smaller build** — no 860 KB WASM engine, no worker chunk; `dist/` drops
   from 19 MB to 8.3 MB.
6. **Offline-first for free** — `gtfs.json` fits in the PWA precache, so a
   fresh install can seed fully offline; after seeding, the store lives in
   OPFS like before.

## End-to-end verification

Beyond the query-level parity checks, the full user flow was exercised on this
branch with mocked geolocation (Kempegowda area) across **two separate browser
origins** — one acting as feeder, one as watcher:

1. GPS → "29 stops nearby" listed (GenosDB `$bbox`), same count and ids as the
   SQL baseline
2. Stop selected → route list and route search working
3. Route selected → P2P room joined (`CURRENTLY TRACKING`)
4. Feeder toggled "inside this bus" → GPS broadcast every 5 s
5. Watcher (fresh origin, seeded from scratch) discovered the feeder from the
   route list — "1 bus ~75m" — via the city-wide presence channel
6. Watcher joined the route → "1 bus tracking on this route" and the live blue
   bus marker rendered on its map, delivered over real WebRTC with Nostr
   signaling

## Reproducing

```bash
bun scripts/make_seed.ts        # rebuild public/gtfs.json from public/*.db
bun install && bun run dev      # first load seeds the store (watch the Loading screen)
npx tsc --noEmit                # clean
bun run build:app               # 8.3 MB dist
```

Query timings were captured in-browser by importing `/src/db/queries.ts` from
the Vite dev server on both branches and running the same fixed inputs
(Kempegowda area, `12.9779, 77.5713`), sorting results by id and diffing.
Timings are from an M-series MacBook running Chromium; expect proportionally
higher numbers on mid-range phones, on both engines alike.
