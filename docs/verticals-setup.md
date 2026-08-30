# Vertical plugin setup

The seven industry-vertical plugins ship with no data. Each one looks for a
dataset by a fixed name and draws nothing until that dataset exists. This page
lists the name each plugin looks for, what the panel reads out of it, and every
settings key the plugin declares.

## How a panel finds its branch

`discoverBranch(datasetName)` in `src/lib/realEstate.ts` does two calls against
the same-origin `/api/v1` proxy:

1. `GET /datasets`, then match a dataset whose `name` equals the requested name
   exactly. No match returns `null`.
2. `GET /datasets/{id}/branches`, then take the branch named `main`, falling
   back to the first branch in the list.

A `null` result is what puts a panel in its unconfigured state. The dataset name
is matched literally, so `Fields` or `field` will not be found.

The vertical list endpoints (`/sensors`, `/towers`, `/fields`, `/incidents`,
`/construction/surveys`, `/construction/milestones`) are served by ptolemy's
verticals module, which maps stored features onto the row shapes below. The
row fields listed under "API row" are what the panel consumes. The keys under
"Feature properties" are read by the panel straight out of each row's free-form
`properties` object, so they have to survive onto the feature you store.

## How settings are stored

`ctx.settings.get(key, default)` in `src/plugins/PluginHost.tsx` reads one JSON
object out of `localStorage` under `viewtopia-plugin-settings:{pluginId}`. A key
that was never set returns the default passed at the call site. The Settings
panel renders an editor for every key a plugin declares.

Declaring a key and reading it are separate things. Several plugins declare keys
that no code reads, and those are marked below. Setting one changes nothing
until the plugin reads it.

## Agriculture

**Dataset name:** `fields` (`FIELDS_DATASET` in `src/lib/verticals.ts`)

**Geometry:** polygon per field. `FieldPanel` gets it from
`fetchBranchGeometry(branchId)` and joins it to a row by feature id, so a field
whose feature carries no decodable geometry lists fine but cannot be
highlighted or coloured on the map.

**API row** (`GET /fields`): `id`, `name`, `crop`, `area_ha`, `soil_type`.
A missing `name` falls back to the first 8 characters of `id`, a missing `crop`
reads as `unknown`.

**Feature properties** the panel reads:

| Key | Type | Missing value |
|---|---|---|
| `ndvi_mean` | number | no NDVI shown, and the field is skipped by the NDVI overlay |
| `soil_moisture` | number | blank |
| `planting_date` | string | blank |
| `harvest_date` | string | blank |
| `status` | string | `planted` |

The NDVI detail readout comes from `GET /fields/ndvi` per field, not from the
properties bag.

**Settings:**

| Key | Type | Default | Read by the plugin |
|---|---|---|---|
| `fieldBranchId` | text | none | no |
| `ndviColorRamp` | select | `rdylgn` | no |
| `stressThreshold` | number | `0.3` | no |

## Construction

**Dataset name:** `construction` (`CONSTRUCTION_DATASET`)

**Geometry:** polygon per survey, joined by feature id from
`fetchBranchGeometry(branchId)`. Milestones have no geometry. Comparing two
surveys without geometry still reports cut and fill volumes, it just draws
nothing.

**API rows:** one dataset feeds two endpoints off the same branch.

`GET /construction/surveys`: `id`, `name`, `date`, `point_count`,
`mean_elevation`.

`GET /construction/milestones`: `id`, `name`, `status`, `due_date`,
`completion_pct`, `planned_pct`. A missing `planned_pct` falls back to
`completion_pct`, which makes the milestone's badge green, since the badge is
green whenever actual is at or above planned.

`POST /surveys/compare` returns `elevation_diff_stats` with `max_cut`,
`max_fill` and `net_volume_m3`, which the panel prints as the cut/fill summary.

**Feature properties:** none. The panel reads only the row fields above.

**Settings:**

| Key | Type | Default | Read by the plugin |
|---|---|---|---|
| `surveyBranchId` | text | none | no |
| `volumeUnit` | select | `m3` | no |

## Emergency

**Dataset name:** `incidents` (`INCIDENTS_DATASET`)

**Geometry:** point, taken from the row's `lat` and `lng`, not from feature
geometry. An incident with either one null cannot be mapped and the panel says
so.

**API row** (`GET /incidents`): `id`, `incident_type`, `severity`, `status`,
`lat`, `lng`, `reported_at`, `description`. Defaults are `unknown` type, `low`
severity, `active` status. The panel hides any incident whose `status` is
`resolved`.

`POST /incidents` writes back, so the branch has to be writable for the report
form to work.

**Feature properties** the panel and plugin read:

| Key | Type | Missing value |
|---|---|---|
| `assigned_units` | array of strings | empty |
| `affected_population` | number | `0` |
| `assembly_points` | array of `{id, lat, lng, capacity}` | evacuation is refused |
| `affected_radius_m`, else `radius_m` | number | falls back to `defaultEvacRadius` |

`assembly_points` is the one that gates a feature. An entry needs numeric `lat`
and `lng` to count. Its `id` defaults to `"{lat},{lng}"` and its `capacity` to
`0`. With no valid entry the evacuation endpoint has nothing to route to, so
both the affected-area and evacuation-route buttons report that instead of
calling out.

Evacuation geometry needs two more services on the same origin: ptolemy's
`POST /api/v1/incidents/evacuate` for the danger zone, and itinera's
`GET /api/route` for the walking routes.

**Settings:**

| Key | Type | Default | Read by the plugin |
|---|---|---|---|
| `incidentBranchId` | text | none | no |
| `defaultEvacRadius` | number | `1000` | yes, when the incident records no radius |
| `sirenSound` | boolean | `false` | no |

## Environmental

**Dataset name:** `sensors` (`SENSORS_DATASET`)

**Geometry:** point from the row's `lat` and `lng`.

`SensorPanel` loads on mount rather than behind a button, so a missing dataset
shows its message as soon as the panel opens.

**API row** (`GET /sensors`): `id`, `name`, `sensor_type`, `lat`, `lng`,
`status`. A missing `sensor_type` reads as `unknown` and a missing `status` as
`normal`. The type dropdown is built from the `sensor_type` values present.

**Feature properties** the panel reads:

| Key | Type | Missing value |
|---|---|---|
| `value` | number | no reading shown |
| `unit` | string | blank |

**Settings:**

| Key | Type | Default | Read by the plugin |
|---|---|---|---|
| `sensorBranchId` | text | none | no |
| `wsUrl` | text | `/ws/sensors` | no |
| `alertThreshold` | number | `90` | no |

## Telecom

**Dataset name:** `towers` (`TOWERS_DATASET`)

**Geometry:** point from the row's `lat` and `lng`. A tower with both at zero is
skipped by the coverage overlay.

**API row** (`GET /towers`): `id`, `name`, `technology`, `height_m`,
`frequency_mhz`, `lat`, `lng`.

**Feature properties** the panel reads:

| Key | Type | Missing value |
|---|---|---|
| `coverage_radius_m` | number | `0`, which switches the footprint to the radio horizon computed from `height_m` |
| `azimuth` | number | `0` |
| `beamwidth` | number | `0`, which makes the footprint omnidirectional rather than a sector |
| `power_dbm` | number | `0` |
| `status` | string | `active` |

The coverage footprint is drawn from these attributes alone. The viewshed button
is separate and calls tiletopia's real terrain viewshed for the entered
observer height.

**Settings:**

| Key | Type | Default | Read by the plugin |
|---|---|---|---|
| `towerBranchId` | text | none | no |
| `coverageColor` | color | `#4c6ef5` | yes, colours both the coverage and viewshed layers |

## Logistics

**Dataset name:** none. This plugin calls `discoverBranch` nowhere, so there is
nothing to create for it.

The Delivery tab takes stops as typed addresses, geocodes each through
`GET /api/geocode/forward`, and posts them to itinera's
`POST /api/delivery/optimize`. That returns visit order and a haversine
distance with no road geometry, so the drawn line is straight segments between
stops.

The Fleet tab has no data source at all. The platform ships no vehicle-position
feed, so the panel states that rather than opening a socket that does not exist.

**Settings:**

| Key | Type | Default | Read by the plugin |
|---|---|---|---|
| `maxStops` | number | `50` | no |

## Real Estate

**Dataset names:** `demo_parcels` (`PARCELS_DATASET`) and `demo_sales`
(`SALES_DATASET`), both in `src/lib/realEstate.ts`. This is the one plugin whose
discovery can be overridden: a non-empty `parcelBranchId` or `salesBranchId`
setting is used as the branch id directly and `discoverBranch` is skipped.

`scripts/seed-parcels.mjs` creates both datasets against a running ptolemy.

**Geometry:** parcels are polygons, returned inline as `geometry_wkb_hex` on the
search response rather than fetched separately. Comps are points, and their
coordinates come out of the properties bag rather than any geometry or column,
so a sale whose properties carry no `lat` and `lng` is listed but not mapped.

**Parcels** (`GET /parcels/search`, by `apn`, `address` or `owner`): the row
carries `id`, `apn`, `address`, `owner`, `zoning`, `sqft` and
`geometry_wkb_hex`.

Properties the panel reads:

| Key | Type | Missing value |
|---|---|---|
| `area_sqft` | number | used only when the row's `sqft` is absent |
| `land_use` | string | blank |
| `assessed_value` | number | `0` |
| `market_value` | number | `0` |
| `year_built` | number | hidden |
| `building_sqft` | number | hidden |
| `flood_zone` | string | `X` |
| `acres` | number | `0`, summed when merging parcels |

**Comps** (`GET /comps/search`): the row carries `id`, `address`, `sale_price`,
`sale_date`, `sqft`, `price_per_sqft` and `distance_m`.

Properties the panel reads:

| Key | Type | Missing value |
|---|---|---|
| `lat` | number | `0`, and the comp is left off the map |
| `lng` | number | `0`, and the comp is left off the map |
| `bedrooms` | number | `0` |
| `bathrooms` | number | `0` |
| `year_built` | number | `0` |

A comps search needs a subject property first. Pick one on the Parcels tab, and
its centroid becomes the search origin.

**Settings:**

| Key | Type | Default | Read by the plugin |
|---|---|---|---|
| `parcelBranchId` | text | empty, meaning discover `demo_parcels` | yes |
| `salesBranchId` | text | empty, meaning discover `demo_sales` | yes |
| `defaultRadius` | number | `1600` | no, the panel's radius slider starts at 0.5 miles |
| `maxDays` | number | `365` | no, the panel's age input starts at 6 months |
