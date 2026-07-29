// @ts-nocheck
import { Database } from 'bun:sqlite'

function logStep(msg: string) {
  console.log(`[make_seed] ${msg}`)
}

async function main() {
  const start = performance.now()

  logStep('opening source databases...')
  const routesSrc = new Database('public/routes.db')
  const stopsSrc = new Database('public/stops.db')
  const joinsSrc = new Database('public/stop_to_trips.db')

  // 1. Load stops (lazy iterate)
  logStep('loading stops...')
  const t1 = performance.now()
  const stops: [number, string, number, number][] = []
  let badStopIds = 0
  for (const row of stopsSrc
    .query('SELECT id, name, lat, lon FROM stops')
    .iterate()) {
    const id = parseInt(row.id)
    if (isNaN(id)) {
      badStopIds++
      continue
    }
    stops.push([id, row.name, row.lat, row.lon])
  }
  logStep(
    `  done: ${stops.length} stops loaded${badStopIds > 0 ? `, ${badStopIds} with non-numeric id skipped` : ''} (${(performance.now() - t1).toFixed(0)}ms)`
  )

  // 2. Load routes (lazy iterate, deduplicate by id, prefer direction=0 via ORDER BY)
  logStep('loading routes...')
  const t2 = performance.now()
  const routes: [number, string, string, number, string, string][] = []
  const nameToId = new Map<string, number>()
  const seenRouteIds = new Set<number>()
  let dupeRoutes = 0
  for (const row of routesSrc
    .query(
      'SELECT id, name, full_name, direction, init_stop, end_stop FROM routes ORDER BY direction'
    )
    .iterate()) {
    if (seenRouteIds.has(row.id)) {
      dupeRoutes++
      continue
    }
    seenRouteIds.add(row.id)
    routes.push([
      row.id,
      row.name,
      row.full_name,
      row.direction,
      row.init_stop,
      row.end_stop
    ])
    nameToId.set(row.name, row.id)
  }
  logStep(
    `  done: ${routes.length} routes loaded, ${dupeRoutes} duplicates skipped (${(performance.now() - t2).toFixed(0)}ms)`
  )

  // 3. Load join table grouped by route: { routeId: stopId[] }
  logStep('loading stop-to-route joins...')
  const t3 = performance.now()
  const joins: Record<number, number[]> = {}
  const seenPairs = new Set<string>()
  let joinCount = 0
  let skipped = 0
  let badJoinIds = 0
  let badJson = 0
  const unknownNames = new Set<string>()
  for (const row of joinsSrc
    .query('SELECT id, stops FROM stops_to_routes')
    .iterate()) {
    const stopId = parseInt(row.id)
    if (isNaN(stopId)) {
      badJoinIds++
      continue
    }
    let names: string[]
    try {
      names = JSON.parse(row.stops)
    } catch {
      badJson++
      continue
    }
    for (const name of names) {
      const routeId = nameToId.get(name)
      if (routeId === undefined) {
        unknownNames.add(name)
        skipped++
        continue
      }
      const pair = `${stopId}:${routeId}`
      if (seenPairs.has(pair)) continue
      seenPairs.add(pair)
      ;(joins[routeId] ??= []).push(stopId)
      joinCount++
    }
  }
  logStep(`  done: ${joinCount} join pairs loaded, ${skipped} skipped`)
  if (badJoinIds > 0)
    logStep(`  ${badJoinIds} rows with non-numeric stop id skipped`)
  if (badJson > 0) logStep(`  ${badJson} rows with malformed JSON skipped`)
  if (unknownNames.size > 0) {
    logStep(
      `  ${unknownNames.size} unknown route names: ${[...unknownNames].slice(0, 10).join(', ')}${unknownNames.size > 10 ? '...' : ''}`
    )
  }
  logStep(`  (${(performance.now() - t3).toFixed(0)}ms)`)

  // 4. Write seed asset
  logStep('writing public/gtfs.json...')
  const out = JSON.stringify({ v: 1, stops, routes, joins })
  await Bun.write('public/gtfs.json', out)
  logStep(`  done: ${(out.length / 1e6).toFixed(2)} MB`)

  logStep(`all done (${(performance.now() - start).toFixed(0)}ms)`)
}

main()
