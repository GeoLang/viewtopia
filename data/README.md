# Data Directory

This directory holds data files for the platform demo.

## Required Files

### `addresses.csv` (included)
Sample address data for geocoding. Format: `address,lat,lng,city,state,zip`

### `region.osm.pbf` (you must download)
OpenStreetMap road network data for routing/delivery optimization.

**Download a region extract from [Geofabrik](https://download.geofabrik.de/):**

```bash
# Small test region (~50MB):
wget -O data/region.osm.pbf https://download.geofabrik.de/europe/luxembourg-latest.osm.pbf

# Or for UK (matches sample data coordinates):
wget -O data/region.osm.pbf https://download.geofabrik.de/europe/great-britain/england/west-midlands-latest.osm.pbf
```

The itinera service will build a routing graph from this file on startup.

## Without OSM Data

If you skip the OSM file, the platform still works:
- All ptolemy endpoints (parcels, comps, sensors, towers, fields, incidents) work fully
- Delivery optimization uses haversine (straight-line) distances instead of road network
- The `/api/route` and `/api/isochrone` endpoints will not be available
