# GeoLang platform

The whole stack from published images. No source checkouts, no builds.

## Prerequisites

Docker Engine with Compose v2. Nothing else. The images come from
`ghcr.io/geolang/*` and the first `up` pulls all of them.

## Run it

1. Generate the two secrets and set the viewer's origin. Replace
   `http://localhost:5174` with the address clients open, with no trailing slash,
   if the stack is not on this machine.

```sh
printf 'PLATFORM_JWT_SECRET=%s\nGEOLANG_EXECUTOR_SECRET=%s\nTILETOPIA_ION_BASE_URL=%s\n' \
  "$(openssl rand -base64 48 | tr -d '\n')" \
  "$(openssl rand -base64 48 | tr -d '\n')" \
  http://localhost:5174 > .env.platform
```

`PLATFORM_JWT_SECRET` is one HS256 secret shared by every service that
validates JWTs, so a token minted by one is accepted by the others. Services
that need it refuse to start on an empty value rather than serve
unauthenticated writes. `GEOLANG_EXECUTOR_SECRET` is what the agent API
presents to the executor that runs tool code. Generate both once and keep them,
a new secret invalidates every session.

`TILETOPIA_ION_BASE_URL` is the start of every absolute URL in Tiletopia's WMTS,
TMS and Ion answers, and of its Ion upload location. Compose stops on an empty
value. A proxy in front of the stack must pass the `Host` header unchanged,
because an Ion upload's signature covers it.

The five `TILETOPIA_GLOBAL_TERRAIN_*` variables are optional and serve global
terrain without an Ion account. Tiletopia's README lists what each one takes.
Left empty, the global terrain routes answer 503 naming what is missing.

IDS checks of IFC models are off in the bundle. They need the `ids-check`
service, which has no published image, so `docker-compose.release.yml` leaves
`TILETOPIA_IDS_CHECK_URL` unset and tiletopia answers an IDS check with 503.

2. Fetch an OSM extract for the region you want. Geocoding and routing read it,
and the file name is fixed.

```sh
scripts/fetch-osm-extract.sh https://download.geofabrik.de/europe/monaco-260101.osm.pbf data/region.osm.pbf
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
- Three of the Rust services carry `cargo deny check advisories` findings with
  no upstream fix published: ptolemy `rsa`, geokode `protobuf` and itinera
  `bincode`.

## What is in here

- `docker-compose.platform.yml`, the stack.
- `docker-compose.release.yml`, the override that swaps every build for a
  published image.
- `deploy/`, the nginx config, the database init script and the geoplumb layer
  file. The stack bind-mounts these, so keep the directory beside the compose
  files.
- `data/`, where the OSM extract goes. Routing writes its graph here too.
- `.env.platform.example`, the two secrets and the viewer's origin with a comment
  each, if you would rather fill them in by hand than run step 1.
- `geolang.env.example`, the model settings, see [The agent](#the-agent).
- `scripts/fetch-osm-extract.sh`, a geofabrik download checked against the
  published md5.
- `scripts/seed-parcels.mjs`, an optional demo dataset of parcels and sales on
  your region: `node scripts/seed-parcels.mjs`. Node only, no install step.
  `ptolemy-seed.mjs` and `platform-token.mjs` beside it are what it imports.
