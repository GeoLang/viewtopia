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

### 1. Start the stack

The panels reach ptolemy, geokode and itinera through the platform stack's
nginx on 5174, so bring up the whole stack from the `viewtopia/` checkout.
It needs Docker Engine with Compose v2 and the sibling repos, see the
[README](../README.md#requirements).

```bash
bash scripts/platform-up.sh
```

Open http://localhost:5174, or run `pnpm run dev` for the dev server on 5173,
which proxies to the stack.

### 2. Load parcel data

The plugin looks for a parcels dataset named `parcels`, paired with `sales`, and
falls back to `demo_parcels`, paired with `demo_sales`. It takes the branch called
`main`. `scripts/seed-parcels.mjs` creates the two demo datasets against a
running ptolemy, anchored on the region the stack imported. `platform-up.sh`
already runs it, so this is only needed to seed again:

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

The first run downloads several GB of source files into `data/toronto/`, most
of it the StatCan census profile. Files already there are kept, so later runs
download nothing. A second run refuses to write over a dataset that already has
features unless you pass `--replace`. `--skip-parcels` and `--skip-census` load
one half only, `--data-dir` moves the download directory, and `--ptolemy-url`
points at a ptolemy other than `http://localhost:3000`.

The loader also writes `data/toronto/toronto_census_da.gpkg`, which you can drop
straight onto the map.

Routing and address search read the one OSM extract the stack was started with,
Monaco by default. For Toronto drive times and addresses start the stack on the
Toronto extract instead:

```bash
scripts/platform-up.sh https://download.bbbike.org/osm/bbbike/Toronto/Toronto.osm.pbf
```

Two attributions travel with the data in each feature's `source` property, and
both licences allow commercial use:

- Contains information licensed under the Open Government Licence – Toronto
- Statistics Canada, 2021 Census of Population, Open Government Licence – Canada

Ontario does not publish property sale records as open data, so there is no
`sales` dataset for Toronto and the comps panel reports that. It never reads the
Monaco `demo_sales`, which stays paired with `demo_parcels` untouched. Load your
own sales as a dataset named `sales`, or point `salesBranchId` at one.

For your own data, import the files in the viewer by dropping them on the map,
or point the plugin at existing branches: Settings, Real Estate, then
`parcelBranchId` and `salesBranchId`. A branch id set there is used directly and
the name lookup is skipped.

## Features

### Parcel Lookup (ParcelPanel)
- Search by APN, street address, or owner name, and pick from the matches when
  more than one parcel comes back
- View zoning designation with color coding
- See assessed value, market value, year built
- Lot area and building square footage
- FEMA flood zone designation when the data carries one
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
- **Geocoding**: address search powered by geokode (self-hosted, no API keys)
- **Travel Time**: drive-time bands from itinera, 5, 10 and 15 minutes by default
- **Flood**: the Flood panel models a water level over terrain. There is no FEMA flood zone overlay, only the parcel's own `flood_zone` badge
- **Measurement**: measure lot frontage, depth, area
- **Print Layout**: a PDF page with title, scale bar, north arrow and legend

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
| `salesBranchId` | Branch id for sales | empty, meaning the sales dataset paired with the parcels dataset |
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
| Parcel viewer | yes | yes |
| Geocoding | yes (hosted) | yes (self-hosted) |
| Comparable sales | yes (add-on) | partial |
| Parcel split/merge | yes | partial |
| Drive-time analysis | yes | partial |
| Flood zone overlay | yes | no |
| Print/PDF export | yes | partial |
| Shapefile/GPKG import | yes | yes |
| Self-hosted | no | yes |
| No vendor lock-in | no | yes |
| No per-seat licensing | no | yes (AGPL) |
| Mobile app | yes | responsive web only |
| Demographics | yes | Toronto census areas from `load-toronto.py` |
| 3D buildings | yes | yes (via tiletopia) |

## License

AGPL-3.0-or-later. Free to use, modify and self-host. Network use requires source disclosure.
