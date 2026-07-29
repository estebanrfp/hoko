import type { GDB } from 'genosdb'
import { isInitializingDatabase } from '../ui/stores'

const SEED_VERSION = 1
const SEED_CHUNK = 500

const { gdb } = await import('genosdb')

const db: GDB = await gdb('hoko-gtfs', { geo: true })

async function cleanupLegacySqlite() {
  localStorage.removeItem('init_db')
  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry('hoko.sqlite')
  } catch {}
}

async function bulk<T>(items: T[], fn: (item: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += SEED_CHUNK) {
    await Promise.all(items.slice(i, i + SEED_CHUNK).map(fn))
  }
}

async function seedDatabase() {
  const { result: meta } = await db.get('gtfs-meta')
  if (meta?.value?.version === SEED_VERSION) return

  const res = await fetch('gtfs.json')
  const {
    stops,
    routes,
    joins
  }: {
    stops: [number, string, number, number][]
    routes: [number, string, string, number, string, string][]
    joins: Record<string, number[]>
  } = await res.json()

  const routesForStop: Record<number, number[]> = {}
  for (const [routeId, stopIds] of Object.entries(joins)) {
    for (const stopId of stopIds) {
      ;(routesForStop[stopId] ??= []).push(Number(routeId))
    }
  }

  await bulk(stops, ([id, name, lat, lon]) =>
    db.put(
      {
        type: 'stop',
        sid: id,
        name,
        location: { latitude: lat, longitude: lon },
        routeIds: routesForStop[id] ?? []
      },
      `stop-${id}`
    )
  )

  await bulk(routes, ([id, name, full_name, direction, start, stop]) =>
    db.put(
      {
        type: 'route',
        rid: id,
        name,
        full_name,
        direction,
        start,
        stop,
        stopIds: joins[id] ?? []
      },
      `route-${id}`
    )
  )

  await db.put({ version: SEED_VERSION }, 'gtfs-meta')
  await cleanupLegacySqlite()
}

const dbPromise = seedDatabase().then(() => {
  isInitializingDatabase.value = false
})

async function isReady() {
  await dbPromise
}

export { db, isReady }
