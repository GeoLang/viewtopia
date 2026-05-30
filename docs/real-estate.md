# GeoLang Real Estate MVP

A self-hosted, open-source alternative to Esri for real estate professionals.
Search parcels, run comparable sales analysis, split/merge lots, and generate reports — all without vendor lock-in.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   viewtopia (Frontend)                    │
│  ParcelPanel · CompsPanel · ParcelEditPanel · Geocoding  │
│  Routing · FloodZone · Measurement · PrintExport         │
└───────────┬───────────────────────┬─────────────────────┘
            │                       │
┌───────────▼───────────┐ ┌────────▼──────────┐
│   ptolemy (API)        │ │  geokode          │
│   Datasets, Branches,  │ │  Geocoding API    │
│   Spatial Queries, MVT │ └───────────────────┘
└───────────┬───────────┘
            │
┌───────────▼───────────┐ ┌───────────────────┐
│   geodukt (Import)     │ │  itinera          │
│   Shapefile, GPKG,     │ │  Routing +        │
│   GeoJSON, CSV         │ │  Drive-time       │
└───────────────────────┘ └───────────────────┘
            │
┌───────────▼───────────┐ ┌───────────────────┐
│   topoi (Geometry)     │ │  projicio         │
│   Split, Merge, R-tree │ │  CRS transforms   │
│   Buffer, Clip         │ │  EPSG registry    │
└───────────────────────┘ └───────────────────┘
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 22+
- Rust 1.85+ (for backend services)

### 1. Start backend services

```bash
cd ptolemy
docker compose up -d

# Create real estate datasets
./scripts/re-setup.sh http://localhost:3000/api/v1
```

### 2. Import parcel data

Download parcel shapefiles from your county assessor's open data portal, then:

```bash
# Import parcels (supports .shp, .gpkg, .geojson)
geodukt import --format shapefile \
  --dataset <PARCELS_DATASET_ID> \
  --url http://localhost:3000/api/v1 \
  parcels.shp

# Import sales records
geodukt import --format csv \
  --dataset <SALES_DATASET_ID> \
  --url http://localhost:3000/api/v1 \
  --lat-col latitude --lon-col longitude \
  sales.csv

# Import zoning overlay
geodukt import --format geojson \
  --dataset <ZONING_DATASET_ID> \
  --url http://localhost:3000/api/v1 \
  zoning.geojson
```

### 3. Configure & start frontend

```bash
cd viewtopia
cp .env.example .env

# Edit .env with your dataset IDs from step 1:
# VITE_API_URL=http://localhost:3000/api/v1
# VITE_PARCELS_DATASET=<id>
# VITE_SALES_DATASET=<id>
# VITE_ZONING_DATASET=<id>
# VITE_GEOCODE_URL=http://localhost:3001
# VITE_ROUTING_URL=http://localhost:3002

npm install
npm run dev
```

Open http://localhost:5173

## Features

### Parcel Lookup (ParcelPanel)
- Search by APN, street address, or owner name
- View zoning designation with color coding
- See assessed value, market value, year built
- Lot area and building square footage
- FEMA flood zone designation
- Click to fly to parcel on map

### Comparable Sales (CompsPanel)
- Search sales within configurable radius (0.1–3 miles)
- Filter by time period (1–24 months)
- Filter by square footage range
- View average price and $/sqft
- Click individual comps to fly to location
- All comps highlighted on map

### Parcel Editing (ParcelEditPanel)
- **Split**: Draw a line across a parcel to subdivide it
- **Merge**: Select 2+ adjacent parcels to combine
- Topology validation (shared boundaries required for merge)
- Backed by topoi's computational geometry engine

### Additional Tools
- **Geocoding** — address search powered by geokode (self-hosted, no API keys)
- **Routing** — drive-time isochrones from itinera (how far in 5/10/15 min?)
- **Flood Analysis** — FEMA flood zone overlay
- **Measurement** — measure lot frontage, depth, area
- **Print/Export** — PDF map reports for clients

## Data Sources

The system works with standard open data formats:

| Data Type | Common Source | Format |
|-----------|-------------|--------|
| Parcels | County Assessor | Shapefile, GeoPackage |
| Sales | MLS / County Recorder | CSV, GeoJSON |
| Zoning | City Planning Dept | GeoJSON, Shapefile |
| Flood zones | FEMA NFHL | Shapefile |
| Imagery | USGS, local govt | GeoTIFF (via terrano) |

## Configuration Reference

### Environment Variables (viewtopia/.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Ptolemy API base URL | `http://localhost:3000/api/v1` |
| `VITE_PARCELS_DATASET` | UUID of parcels dataset | — |
| `VITE_SALES_DATASET` | UUID of sales dataset | — |
| `VITE_ZONING_DATASET` | UUID of zoning dataset | — |
| `VITE_GEOCODE_URL` | Geokode service URL | `http://localhost:3001` |
| `VITE_ROUTING_URL` | Itinera routing service URL | `http://localhost:3002` |

### Docker Compose Services

```yaml
services:
  ptolemy:     # API + storage (port 3000)
  geokode:    # Geocoding (port 3001)
  itinera:    # Routing (port 3002)
  viewtopia:  # Frontend (port 5173)
```

## Comparison with Esri

| Feature | Esri ArcGIS | GeoLang RE |
|---------|------------|--------------|
| Parcel viewer | ✅ | ✅ |
| Geocoding | ✅ (hosted) | ✅ (self-hosted) |
| Comparable sales | ✅ (add-on) | ✅ |
| Parcel split/merge | ✅ | ✅ |
| Drive-time analysis | ✅ | ✅ |
| Flood zone overlay | ✅ | ✅ |
| Print/PDF export | ✅ | ✅ |
| Shapefile/GPKG import | ✅ | ✅ |
| Self-hosted | ❌ | ✅ |
| No vendor lock-in | ❌ | ✅ |
| No per-seat licensing | ❌ | ✅ (AGPL) |
| Mobile app | ✅ | ⚠️ (responsive web) |
| Demographics | ✅ | ⚠️ (Census API manual) |
| 3D buildings | ✅ | ✅ (via tiletopia) |

## License

AGPL-3.0-or-later — free to use, modify, and self-host. Network use requires source disclosure.
