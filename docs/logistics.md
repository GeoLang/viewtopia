# GeoLang Logistics MVP

A self-hosted delivery workflow prototype. The delivery panel can optimize a
multi-stop order and draw a straight-line sequence. The fleet panel shows an
empty state and nothing else, since no vehicle feed exists. Geofences are
created locally and read by one Space-Time analysis.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   viewtopia (Frontend)                    │
│  FleetPanel · DeliveryPanel · GeofencePanel · Routing    │
│  TrafficPanel · HeatmapPanel · MeasurementPanel          │
└────────────────────┬──────────────────┬─────────────────┘
                     │                  │
            ┌────────▼──────┐  ┌────────▼────┐
            │  itinera       │  │  geokode    │
            │  Routing +     │  │  Address    │
            │  VRP/TSP       │  │  lookup     │
            │  Isochrones    │  └─────────────┘
            └────────────────┘
```

## Quick Start

The panels call `/api/geocode/forward` and `/api/delivery/optimize`
same-origin, and only the platform stack's nginx on 5174 routes those to
geokode and itinera. So bring up the stack on the region you deliver in, from
the `viewtopia/` checkout:

```bash
bash scripts/platform-up.sh https://download.geofabrik.de/europe/monaco-latest.osm.pbf
```

Open http://localhost:5174, or run `pnpm run dev` for the dev server on 5173,
which proxies to the stack. There is nothing to configure. The plugin declares
one setting, `maxStops`, which nothing reads.

## Features

### Fleet Tracking (FleetPanel)
- The panel draws one empty state and nothing else. It says no vehicle-position
  service is connected and opens no socket
- The platform ships no vehicle feed, and there is no setting that would point
  the panel at one

### Delivery Management (DeliveryPanel)
- **Create delivery routes** with multiple stops
- **Address geocoding**: type address, auto-resolve coordinates
- **Route optimization**: itinera reorders the stops by nearest neighbour plus 2-opt over great-circle distances
- **Progress tracking**: check off completed deliveries
- **Distance & time estimates** after optimization
- Click any stop to fly to it on map

### Route Optimization (itinera)
- `POST /api/delivery/optimize` returns a visit order and a haversine distance,
  and a duration at a fixed 30 km/h
- No road geometry comes back, so the drawn line is straight segments
- The plugin declares a `maxStops` setting, 50 by default, but nothing reads it,
  so the stop count has no cap

### Geofencing (GeofencePanel)
- Name a fence and give it a centre and a radius
- The panel also offers a polygon fence, which is stored with no vertices and
  so matches nothing
- Crossings are found by the Geofence Crossings analysis in the Space-Time
  panel, over imported tracks. There is no alerting and no live event stream
- No renderer draws a fence

### Additional Tools (existing)
- **RoutingPanel**: a route line with distance and duration, from itinera or the public OSRM demo. There are no turn-by-turn instructions
- **TrafficPanel**: traffic overlay from your own provider tiles (TomTom/HERE key), or a zero-config demo mode coloring OSM roads by synthetic congestion
- **HeatmapPanel**: delivery density visualization
- **Travel Time**: service area bands from itinera, 5, 10 and 15 minutes by default

## Comparison with Alternatives

| Feature | Esri Fleet | HERE Fleet | Samsara | GeoLang |
|---------|-----------|-----------|---------|-----------|
| Real-time tracking | yes | yes | yes | no |
| Route optimization | yes | yes | yes | partial |
| Geofencing | yes | yes | yes | partial |
| Multi-stop delivery | yes | yes | yes | yes |
| Drive-time isochrones | yes | yes | no | yes |
| Self-hosted | no | no | no | yes |
| No per-vehicle fee | no | no | no | yes |
| Open source | no | no | no | yes |
| Custom GPS hardware | limited | limited | yes | no |
| Traffic overlay | yes | yes | yes | partial |
| Address lookup | yes | yes | no | yes |
| 3D visualization | yes | no | no | yes |

## License

AGPL-3.0-or-later
