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

### 1. Start services

```bash
cd ptolemy && docker compose up -d

# Start routing service
cd itinera && cargo run --release -p itinera-server -- --port 3002

# Start geocoding service (import address data first)
cd geokode && cargo run --release -p geokode-server -- --port 3001
```

### 2. Start frontend

```bash
cd viewtopia
pnpm install && pnpm run dev
```

There is nothing to configure. The panels call `/api/geocode/forward` and
`/api/delivery/optimize` same-origin, and the dev server proxies those to the
platform stack. The plugin declares one setting, `maxStops`.

## Features

### Fleet Tracking (FleetPanel)
- The panel draws one empty state and nothing else. It says no vehicle-position
  service is connected and opens no socket
- The platform ships no vehicle feed, and there is no setting that would point
  the panel at one

### Delivery Management (DeliveryPanel)
- **Create delivery routes** with multiple stops
- **Address geocoding** — type address, auto-resolve coordinates
- **Route optimization** — reorders stops for shortest path (TSP/VRP via itinera)
- **Progress tracking** — check off completed deliveries
- **Distance & time estimates** after optimization
- Click any stop to fly to it on map

### Route Optimization (itinera VRP)
- `POST /api/delivery/optimize` returns a visit order and a haversine distance
- No road geometry comes back, so the drawn line is straight segments
- The stop count is capped by the plugin's `maxStops` setting, 50 by default

### Geofencing (GeofencePanel)
- Name a fence and give it a centre and a radius
- The panel also offers a polygon fence, which is stored with no vertices and
  so matches nothing
- Crossings are found by the Geofence Crossings analysis in the Space-Time
  panel, over imported tracks. There is no alerting and no live event stream
- No renderer draws a fence

### Additional Tools (existing)
- **RoutingPanel** — turn-by-turn directions
- **TrafficPanel** — traffic overlay from your own provider tiles (TomTom/HERE key), or a zero-config demo mode coloring OSM roads by synthetic congestion
- **HeatmapPanel** — delivery density visualization
- **Isochrones** — service area planning (5/10/15 min drive-time)

## Comparison with Alternatives

| Feature | Esri Fleet | HERE Fleet | Samsara | GeoLang |
|---------|-----------|-----------|---------|-----------|
| Real-time tracking | ✅ | ✅ | ✅ | ❌ |
| Route optimization | ✅ | ✅ | ✅ | ✅ |
| Geofencing | ✅ | ✅ | ✅ | partial |
| Multi-stop delivery | ✅ | ✅ | ✅ | ✅ |
| Drive-time isochrones | ✅ | ✅ | ❌ | ✅ |
| Self-hosted | ❌ | ❌ | ❌ | ✅ |
| No per-vehicle fee | ❌ | ❌ | ❌ | ✅ |
| Open source | ❌ | ❌ | ❌ | ✅ |
| Custom GPS hardware | ⚠️ | ⚠️ | ✅ | ❌ |
| Traffic overlay | ✅ | ✅ | ✅ | partial |
| Address lookup | ✅ | ✅ | ❌ | ✅ |
| 3D visualization | ✅ | ❌ | ❌ | ✅ |

## License

AGPL-3.0-or-later
