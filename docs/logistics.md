# GeoLang Logistics MVP

A self-hosted fleet management and delivery optimization platform.
Track vehicles in real-time, optimize multi-stop routes, set up geofences, and manage deliveries — no per-vehicle SaaS fees.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   viewtopia (Frontend)                    │
│  FleetPanel · DeliveryPanel · GeofencePanel · Routing    │
│  TrafficPanel · HeatmapPanel · MeasurementPanel          │
└──────┬──────────────────┬────────────────┬──────────────┘
       │                  │                │
┌──────▼──────┐  ┌────────▼──────┐  ┌─────▼───────┐
│  ptolemy     │  │  itinera       │  │  geokode    │
│  Fleet data  │  │  Routing +     │  │  Address    │
│  Geofences   │  │  VRP/TSP       │  │  Validation │
│  WebSocket   │  │  Isochrones    │  └─────────────┘
└──────────────┘  └────────────────┘
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

### 2. Configure frontend

```bash
cd viewtopia
cp .env.example .env
```

Edit `.env`:
```env
VITE_API_URL=http://localhost:3000/api/v1
VITE_FLEET_WS_URL=ws://localhost:3000/ws/fleet
VITE_ROUTING_URL=http://localhost:3002
VITE_GEOCODE_URL=http://localhost:3001
```

### 3. Start frontend

```bash
pnpm install && pnpm run dev
```

## Features

### Fleet Tracking (FleetPanel)
- **Real-time GPS positions** via WebSocket
- Vehicle status: active, idle, offline, alert
- Search/filter by name, driver, status
- Click to fly to vehicle on map
- Speed, heading, fuel level display
- Delivery progress (stops completed/total)

### Delivery Management (DeliveryPanel)
- **Create delivery routes** with multiple stops
- **Address geocoding** — type address, auto-resolve coordinates
- **Route optimization** — reorders stops for shortest path (TSP/VRP via itinera)
- **Progress tracking** — check off completed deliveries
- **Distance & time estimates** after optimization
- Click any stop to fly to it on map

### Route Optimization (itinera VRP)
- Nearest-neighbor heuristic + 2-opt local search
- Haversine or road-network distance matrices
- Return-to-depot option for round trips
- Handles 100+ stops efficiently

### Geofencing (GeofencePanel — existing)
- Circle or polygon geofences
- Enter/exit alerts
- Warehouse zones, delivery areas, restricted zones
- Real-time event stream via WebSocket

### Additional Tools (existing)
- **RoutingPanel** — turn-by-turn directions
- **TrafficPanel** — traffic overlay from your own provider tiles (TomTom/HERE key), or a zero-config demo mode coloring OSM roads by synthetic congestion
- **HeatmapPanel** — delivery density visualization
- **Isochrones** — service area planning (5/10/15 min drive-time)

## Configuration Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Ptolemy API | `http://localhost:3000/api/v1` |
| `VITE_FLEET_WS_URL` | Fleet WebSocket | `ws://localhost:3000/ws/fleet` |
| `VITE_ROUTING_URL` | Itinera routing | `http://localhost:3002` |
| `VITE_GEOCODE_URL` | Geokode service | `http://localhost:3001` |

## GPS Tracker Integration

The fleet WebSocket accepts position updates in this format:

```json
{
  "type": "position",
  "vehicle_id": "truck-001",
  "lat": 34.0522,
  "lng": -118.2437,
  "speed": 45.2,
  "heading": 270,
  "timestamp": "2025-01-15T10:30:00Z"
}
```

Compatible with:
- **Traccar** — open-source GPS tracking (forward to WebSocket)
- **OwnTracks** — mobile phone tracking
- **Custom hardware** — any device posting JSON over WebSocket/HTTP

## Comparison with Alternatives

| Feature | Esri Fleet | HERE Fleet | Samsara | GeoLang |
|---------|-----------|-----------|---------|-----------|
| Real-time tracking | ✅ | ✅ | ✅ | ✅ |
| Route optimization | ✅ | ✅ | ✅ | ✅ |
| Geofencing | ✅ | ✅ | ✅ | ✅ |
| Multi-stop delivery | ✅ | ✅ | ✅ | ✅ |
| Drive-time isochrones | ✅ | ✅ | ❌ | ✅ |
| Self-hosted | ❌ | ❌ | ❌ | ✅ |
| No per-vehicle fee | ❌ | ❌ | ❌ | ✅ |
| Open source | ❌ | ❌ | ❌ | ✅ |
| Custom GPS hardware | ⚠️ | ⚠️ | ✅ | ✅ |
| Traffic overlay | ✅ | ✅ | ✅ | ✅ |
| Address validation | ✅ | ✅ | ❌ | ✅ |
| 3D visualization | ✅ | ❌ | ❌ | ✅ |

## License

AGPL-3.0-or-later
