import { getCoordRange } from '../lib/location'
import { db } from './client'
import type { Route, Stop } from './schema'

interface StopNode {
  value: {
    type: string
    sid: number
    name: string
    location: { latitude: number; longitude: number }
    routeIds: number[]
  }
}

interface RouteNode {
  value: {
    type: string
    rid: number
    name: string
    full_name: string
    direction: number
    start: string
    stop: string
    stopIds: number[]
  }
}

const toStop = (node: StopNode): Stop => ({
  id: node.value.sid,
  name: node.value.name,
  lat: node.value.location.latitude,
  lon: node.value.location.longitude
})

const toRoute = (node: RouteNode): Route => ({
  id: node.value.rid,
  name: node.value.name,
  full_name: node.value.full_name,
  direction: node.value.direction,
  start: node.value.start,
  stop: node.value.stop
})

async function getMany(ids: string[]) {
  const nodes = await Promise.all(ids.map(id => db.get(id)))
  return nodes.map(n => n.result).filter(n => n !== null)
}

export async function getClosestStops(
  coords: GeolocationCoordinates
): Promise<Stop[]> {
  const { minLat, maxLat, minLon, maxLon } = getCoordRange(
    coords.latitude,
    coords.longitude,
    1
  )

  const { results } = await db.map({
    query: {
      type: 'stop',
      location: {
        $bbox: { minLat, maxLat, minLng: minLon, maxLng: maxLon }
      }
    }
  })

  return results.map(toStop)
}

export async function getRoutesForStop(stopId: number): Promise<Route[]> {
  const { result } = await db.get(`stop-${stopId}`)
  if (!result) return []

  const nodes = await getMany(
    result.value.routeIds.map((id: number) => `route-${id}`)
  )
  return nodes.map(toRoute)
}

export async function getSearchedRoutes(
  id: number,
  term: string
): Promise<Route[]> {
  const routes = await getRoutesForStop(id)
  if (term.length === 0) return routes.slice(0, 10)

  const lower = term.toLowerCase()
  return routes.filter(r => r.name.toLowerCase().includes(lower)).slice(0, 10)
}

export async function getStopsForRoute(routeId: number): Promise<Stop[]> {
  const { result } = await db.get(`route-${routeId}`)
  if (!result) return []

  const nodes = await getMany(
    result.value.stopIds.map((id: number) => `stop-${id}`)
  )
  return nodes.map(toStop)
}
