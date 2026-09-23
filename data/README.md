# data

The platform compose file mounts this directory into geokode and itinera at
`/data`. Everything here except this README and `addresses.csv` is generated
and gitignored.

| File | What it is |
|------|------------|
| `region.osm.pbf` | The OSM extract. geokode imports its addresses from it, itinera builds its routing graph from it. `scripts/platform-up.sh` downloads it, Monaco by default |
| `graph.bin` | itinera's routing graph. itinera builds it on start only when it is missing, so delete it after swapping the extract |
| `.region-url` | The extract URL `platform-up.sh` last fetched. A different URL on the next run triggers a new download and graph build |
| `addresses.csv` | Sample addresses in OpenAddresses form, `LON,LAT,NUMBER,STREET,CITY,REGION,POSTCODE`. geokode reads it only when its `--data` flag is pointed at it |
| `toronto/` | Source downloads and `toronto_census_da.gpkg` from `scripts/load-toronto.py` |

To swap the extract by hand:

```bash
scripts/fetch-osm-extract.sh https://download.geofabrik.de/europe/luxembourg-latest.osm.pbf data/region.osm.pbf
rm -f data/graph.bin
docker compose --env-file .env.platform -f docker-compose.platform.yml restart geokode itinera
```

Without `region.osm.pbf` and `graph.bin`, itinera's container starts no server,
so routing, isochrones, travel time and delivery ordering all fail.
