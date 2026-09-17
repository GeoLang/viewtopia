# GeoLang platform

The whole stack from published images. No source checkouts, no builds.

## Prerequisites

Docker Engine with Compose v2. Nothing else. The images come from
`ghcr.io/geolang/*` and the first `up` pulls all of them.

## Run it

1. Generate the two secrets.

```sh
printf 'PLATFORM_JWT_SECRET=%s\nGEOLANG_EXECUTOR_SECRET=%s\n' \
  "$(openssl rand -base64 48 | tr -d '\n')" \
  "$(openssl rand -base64 48 | tr -d '\n')" > .env.platform
```

`PLATFORM_JWT_SECRET` is one HS256 secret shared by every service that
validates JWTs, so a token minted by one is accepted by the others. Services
that need it refuse to start on an empty value rather than serve
unauthenticated writes. `GEOLANG_EXECUTOR_SECRET` is what the agent API
presents to the executor that runs tool code. Generate both once and keep them,
a new secret invalidates every session.

2. Fetch an OSM extract for the region you want. Geocoding and routing read it,
and the file name is fixed.

```sh
scripts/fetch-osm-extract.sh https://download.geofabrik.de/europe/monaco-latest.osm.pbf data/region.osm.pbf
```

3. Start the stack.

```sh
docker compose --env-file .env.platform -f docker-compose.platform.yml -f docker-compose.release.yml up -d
```

4. Wait for the services to report healthy.

```sh
docker compose --env-file .env.platform -f docker-compose.platform.yml -f docker-compose.release.yml ps
```

Routing builds its graph from the extract on first start. For a big metro that
import runs for minutes and the container reports unhealthy meanwhile.

5. Open http://localhost:5174.

## The agent

Chat needs a model. Either put a cloud key in `geolang.env` beside this file:

```sh
cp geolang.env.example geolang.env
```

and set `SIBYL_CLOUD_API_KEY`, or run an OpenAI-compatible server on the host
and point `SIBYL_LOCAL_API_BASE` at it. Both are switchable later under
Settings, AI Model, in the viewer, and what you set there is stored and
overrides the file on the next start. Everything except chat works without a
model.

Speech to text is not part of this bundle. It needs an NVIDIA GPU and a
separate Aavaaz checkout, so the bundle leaves that service out.

## Defaults you should know

- Share links never expire, there is no expiry column, and a link is revoked by
  hand.
- Whether an anonymous share-link guest gets a `view` or an `edit` role is set
  per link, so a link can hand editing to anyone who has the URL.
- Tiletopia serves every asset's tiles and `tileset.json` publicly, even for
  private assets, so anyone holding the asset id can read them.
- Whether the database connection verifies TLS rests on the connection string
  an operator sets, and `sslmode=require` buys encryption with no
  authentication because it accepts any certificate.
- Four of the Rust services carry `cargo deny check advisories` findings with
  no upstream fix published: ptolemy `rsa`, geodukt `quick-xml`, geokode
  `protobuf` and itinera `bincode`.

## What is in here

- `docker-compose.platform.yml`, the stack.
- `docker-compose.release.yml`, the override that swaps every build for a
  published image.
- `deploy/`, the nginx config, the database init script and the geoplumb layer
  file. The stack bind-mounts these, so keep the directory beside the compose
  files.
- `data/`, where the OSM extract goes. Routing writes its graph here too.
- `scripts/fetch-osm-extract.sh`, a geofabrik download checked against the
  published md5.
- `scripts/seed-parcels.mjs`, an optional demo dataset of parcels and sales on
  your region: `node scripts/seed-parcels.mjs`. Node only, no install step.
