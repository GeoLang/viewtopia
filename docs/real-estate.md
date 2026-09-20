# GeoLang Real Estate MVP

A self-hosted real estate panel prototype. Parcel and sales search require
configured Ptolemy branches or the seeded demo datasets. Nothing checks the
resulting geometry at commit time.

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
│   Parcel search, MVT,  │ └───────────────────┘
│   ST_Split             │
└────────────────────────┘ ┌───────────────────┐
                           │  itinera          │
                           │  Routing +        │
                           │  Drive-time       │
                           └───────────────────┘
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+
- Rust 1.85+ (for backend services)

### 1. Start backend services

```bash
cd ptolemy
docker compose up -d
```

### 2. Load parcel data

The plugin looks for a parcels dataset named `parcels`, falls back to
`demo_parcels`, and pairs it with `demo_sales`. It takes the branch called
`main`. `scripts/seed-parcels.mjs` creates the two demo datasets against a
running ptolemy, anchored on the region the stack imported.

```bash
node scripts/seed-parcels.mjs
```

#### Real Toronto parcels

`scripts/load-toronto.py` writes City of Toronto open data into `parcels` and
2021 census dissemination areas into `toronto_census_da`. Because `parcels` wins
the name lookup, loading it shadows the demo set without deleting it.

```bash
uv run scripts/load-toronto.py                                  # the whole city
uv run scripts/load-toronto.py --bbox -79.40,43.64,-79.37,43.66 # one neighbourhood
```

Parcels get `apn` (the city's PARCELID), `address` from the lowest-numbered
address point inside the polygon and `address_count` for how many fell in it,
`zoning` and `zone_category` from by-law 569-2013, the three floor-space ratios,
`land_use`, `area_sqm`, `sqft`, `acres`, `lat`, `lng` and `source`. Dissemination areas get `population`,
the three age bands, `median_income` and `median_household_income`.

It downloads 2.87 GB the first time: 160 MB of property boundaries, 208 MB of
address points, 51 MB of zoning, 197 MB of StatCan boundaries and a 2.25 GB
census profile zip. Files already on disk are kept, so later runs download
nothing. The downtown bbox above takes about 100 s once the files are local,
and 92 s of that goes to scanning the 8.8 GB Ontario census CSV. The whole
city should take 4 to 6 minutes, an estimate from the per-feature rates, not
a measured run. A second run refuses to write over a
dataset that already has features unless you pass `--replace`.

The loader also writes `data/toronto/toronto_census_da.gpkg`, which you can drop
straight onto the map.

Two attributions travel with the data in each feature's `source` property, and
both licences allow commercial use:

- Contains information licensed under the Open Government Licence – Toronto
- Statistics Canada, 2021 Census of Population, Open Government Licence – Canada

Sales stay demo data. Ontario does not publish property sale records as open
data, so the comps panel keeps reading `demo_sales` and `scripts/load-toronto.py`
never touches it.

For your own data, import the files in the viewer by dropping them on the map,
or point the plugin at existing branches: Settings, Real Estate, then
`parcelBranchId` and `salesBranchId`. A branch id set there is used directly and
the name lookup is skipped.

### 3. Start the frontend

```bash
cd viewtopia
pnpm install
pnpm run dev
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
- Split posts the cut line to ptolemy's `/geoprocessing/split`, which runs
  ST_Split. Merge unions the polygons with turf in the browser
- Ptolemy topology validation is not implemented

### Additional Tools
- **Geocoding** — address search powered by geokode (self-hosted, no API keys)
- **Routing** — drive-time isochrones from itinera (how far in 5/10/15 min?)
- **Flood Analysis**: FEMA flood zone overlay when that layer is available
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

The plugin reads no environment variables. Everything it can be told is a plugin
setting, stored in localStorage:

| Setting | Description | Default |
|---------|-------------|---------|
| `parcelBranchId` | Branch id for parcels | empty, meaning discover `parcels` then `demo_parcels` |
| `salesBranchId` | Branch id for sales | empty, meaning discover `demo_sales` |
| `defaultRadius` | Declared but not read. The radius slider starts at 0.5 miles | `1600` |
| `maxDays` | Declared but not read. The age input starts at 6 months | `365` |

### Docker Compose Services

```yaml
services:
  ptolemy:     # API + storage (port 3000)
  geokode:    # Geocoding (port 3001)
  itinera:    # Routing (port 3002)
  viewtopia:  # Frontend behind nginx (port 5174)
```

## Comparison with Esri

| Feature | Esri ArcGIS | GeoLang RE |
|---------|------------|--------------|
| Parcel viewer | ✅ | ✅ |
| Geocoding | ✅ (hosted) | ✅ (self-hosted) |
| Comparable sales | ✅ (add-on) | partial |
| Parcel split/merge | ✅ | partial |
| Drive-time analysis | ✅ | partial |
| Flood zone overlay | ✅ | partial |
| Print/PDF export | ✅ | partial |
| Shapefile/GPKG import | ✅ | ✅ |
| Self-hosted | ❌ | ✅ |
| No vendor lock-in | ❌ | ✅ |
| No per-seat licensing | ❌ | ✅ (AGPL) |
| Mobile app | ✅ | ⚠️ (responsive web) |
| Demographics | ✅ | ⚠️ (Census API manual) |
| 3D buildings | ✅ | ✅ (via tiletopia) |

## License

AGPL-3.0-or-later — free to use, modify, and self-host. Network use requires source disclosure.
