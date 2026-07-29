## Hōkō

> direction in japanese

Experimental community BMTC bus tracking app which aims to be accurate in
tracking and not navigation.

> Parts of this app are written by AI, reviewed by humans.

## Theory

- based on BMTC gtfs data, https://github.com/Vonter/bmtc-gtfs, we can plot all
  stops on map
- take user gps coords, and find closest stops to their location
- before start of tracking, show all routes based on closest stops
- once a route is chosen for tracking, ask if they're in the bus
- if yes, take them as a source of data and broadcast location to the P2P room
- every person that joins the same route connects via WebRTC and receives live
  GPS from feeders
- cluster nearby buses on the map, show bus markers with pulsing beacon

## Stack

- Preact + Signals for UI reactivity
- GenosDB (WebRTC + Nostr signaling) for P2P networking
- GenosDB (OPFS graph store + geo module) for local GTFS stop/route data
- Leaflet + OpenStreetMap for map rendering
- Tailwind CSS

## Architecture

- single GenosDB instance per session, channels scoped per route
  (`gps-{routeId}`)
- feeder broadcasts GPS every 5s, consumers listen on the same channel
- first GPS message from a peer auto-registers them as a feeder — no separate
  handshake
- stale feeders expire after 2 min of inactivity
- SVG markers: red pin for stops, blue bus icon with pulsing beacon ring for
  active feeders

## Measures

**Bucketing / clustering** — multiple feeders on the same route are grouped
using a greedy clustering algorithm with a 50m haversine distance threshold.
Feeders within 50m of each other merge into a single cluster marker showing the
count (e.g. "3 buses"). A pivot is picked from the remaining feeders, all
feeders within 50m of the pivot are grouped, and the process repeats for the
leftovers. The cluster center is the average lat/lon of all grouped feeders.

**Smart session revive** — on page reload, the app checks if the user had a
chosen route/stop (persisted in localStorage). Instead of blindly rejoining, it
queries all stops on that route from the local GenosDB store, then uses haversine
distance to check if the user's current GPS position is within 500m of any route
stop. If close — revives the P2P session and resumes tracking. If too far (e.g.
user went home) — clears the stale persisted state so they start fresh.

## Challenges

- accuracy of data <- based on gps location permissions, coordinates may or may
  not be on road
- human errors in choosing wrong route and then tracking may send completely
  different coordinates for the route
- e.g. a bus can be going from whitefield to majestic, but someone in E-City,
  may start sending tracking data and all is messed up
- P2P connectivity — WebRTC may fail on restrictive NATs without TURN servers
- handling lot of live tracking data, in memory or disk

## Implementation details

- init map and plot user location
- extract all stops from db and show closest stops as red pin markers
- once a stop is chosen, query routes serving that stop
- once a route is chosen, join the P2P room and the route's GPS channel
- if inside the bus, start broadcasting GPS every 5s — you become a feeder
- if watching, receive GPS from feeders in the room and plot as blue bus markers
  with beacon
- buses within 50m of each other cluster into a single marker showing count
- on page reload, smart revive checks GPS proximity to route stops before
  rejoining

## Screenshots

<img width="1470" height="804" alt="image" src="https://github.com/user-attachments/assets/2d9c9cb0-eb47-44f1-8d4a-169c5e9d7595" />

## Citations

Matthew, V. Unofficial BMTC GTFS [Data set]. https://github.com/Vonter/bmtc-gtfs
