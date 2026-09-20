# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "geopandas>=1.1,<2",
#     "pyogrio>=0.13,<0.14",
#     "requests>=2.34,<3",
# ]
# ///

import argparse
import base64
import csv
import hmac
import io
import json
import os
import re
import time
import zipfile
from contextlib import contextmanager
from pathlib import Path

import geopandas
import pandas
import requests
from shapely.geometry import mapping

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent

PROPERTY_BOUNDARIES_FILE = "property-boundaries-4326.gpkg"
PROPERTY_BOUNDARIES_URL = "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/1acaa8b0-f235-4df6-8305-02025ccdeb07/resource/7e9fff54-71c8-4958-b74a-2419f727c8a7/download/property-boundaries-4326.gpkg"
ADDRESS_POINTS_FILE = "address-points-4326.gpkg"
ADDRESS_POINTS_URL = "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/abedd8bc-e3dd-4d45-8e69-79165a76e4fa/resource/f9557b4f-724f-47ff-9326-c9d55050f648/download/address-points-4326.gpkg"
ZONING_AREAS_FILE = "zoning-area-4326.geojson"
ZONING_AREAS_URL = "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/34927e44-fc11-4336-a8aa-a0dfb27658b7/resource/d75fa1ed-cd04-4a0b-bb6d-2b928ffffa6e/download/zoning-area-4326.geojson"
DISSEMINATION_AREA_BOUNDARIES_FILE = "lda_000b21a_e.zip"
DISSEMINATION_AREA_BOUNDARIES_URL = "https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lda_000b21a_e.zip"
CENSUS_PROFILE_FILE = "census-profile-da-2021.zip"
CENSUS_PROFILE_URL = "https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/details/download-telecharger/comp/GetFile.cfm?Lang=E&FILETYPE=CSV&GEONO=006"

PARCEL_DOWNLOADS = [
    (PROPERTY_BOUNDARIES_FILE, PROPERTY_BOUNDARIES_URL),
    (ADDRESS_POINTS_FILE, ADDRESS_POINTS_URL),
    (ZONING_AREAS_FILE, ZONING_AREAS_URL),
]
CENSUS_DOWNLOADS = [
    (DISSEMINATION_AREA_BOUNDARIES_FILE, DISSEMINATION_AREA_BOUNDARIES_URL),
    (CENSUS_PROFILE_FILE, CENSUS_PROFILE_URL),
]

PARCELS_DATASET = "parcels"
CENSUS_DATASET = "toronto_census_da"
CENSUS_GEOPACKAGE_FILE = "toronto_census_da.gpkg"
MAIN_BRANCH = "main"
IMPORT_AUTHOR = "load-toronto"

TORONTO_ATTRIBUTION = "City of Toronto Open Data, Open Government Licence – Toronto"
STATISTICS_CANADA_ATTRIBUTION = (
    "Statistics Canada, 2021 Census of Population, Open Government Licence – Canada"
)

WGS84 = "EPSG:4326"
SQUARE_FEET_PER_SQUARE_METRE = 10.7639
SQUARE_METRES_PER_ACRE = 4046.856
# parcels on the bbox edge lose their address and zone without this
NEIGHBOUR_PADDING_DEGREES = 0.002

MAX_FEATURES_PER_IMPORT = 50_000
MAX_IMPORT_BODY_BYTES = 48 * 1024 * 1024
FEATURES_PER_DELETE_COMMIT = 5_000
FEATURE_PAGE_SIZE = 10_000

HTTP_TIMEOUT_SECONDS = 120
IMPORT_TIMEOUT_SECONDS = 900
DOWNLOAD_CHUNK_BYTES = 1024 * 1024
PARTIAL_CONTENT_STATUS = 206
CONTENT_RANGE_TOTAL_PATTERN = re.compile(r"/(\d+)\s*$")

PLATFORM_SECRET_VARIABLE = "PLATFORM_JWT_SECRET"
PLATFORM_ENV_FILE = ".env.platform"
PLATFORM_SECRET_PATTERN = re.compile(
    r"^\s*(?:export\s+)?PLATFORM_JWT_SECRET\s*=\s*(.*)$"
)
TOKEN_SUBJECT = "load-toronto"
TOKEN_ROLE = "editor"
TOKEN_LIFETIME_SECONDS = 3600

TORONTO_CENSUS_DIVISION = "3520"
DISSEMINATION_AREA_ID_COLUMN = "DAUID"
DISSEMINATION_GUID_COLUMN = "DGUID"
# the zip holds one CSV per region, Toronto is only in the Ontario one
CENSUS_PROFILE_MEMBER = "98-401-X2021006_English_CSV_data_Ontario.csv"
CENSUS_GEO_CODE_COLUMN = "ALT_GEO_CODE"
CENSUS_CHARACTERISTIC_ID_COLUMN = "CHARACTERISTIC_ID"
CENSUS_CHARACTERISTIC_NAME_COLUMN = "CHARACTERISTIC_NAME"
CENSUS_VALUE_COLUMN = "C1_COUNT_TOTAL"

# characteristic id -> output column and the label StatCan prints for it
CENSUS_CHARACTERISTICS = {
    "1": ("population", "Population, 2021"),
    "9": ("age_0_14", "0 to 14 years"),
    "13": ("age_15_64", "15 to 64 years"),
    "24": ("age_65_plus", "65 years and over"),
    "113": ("median_income", "Median total income in 2020 among recipients ($)"),
    "243": (
        "median_household_income",
        "Median total income of household in 2020 ($)",
    ),
}
CENSUS_COLUMNS = [column for column, _ in CENSUS_CHARACTERISTICS.values()]

# -1, -2 and -3 in the PRCNT_ columns mean the zone sets no ratio
SMALLEST_REAL_ZONING_RATIO = 0.0

STATED_AREA_PATTERN = re.compile(r"[0-9]*\.?[0-9]+")
CENSUS_NUMBER_PATTERN = re.compile(r"[-+]?[0-9]*\.?[0-9]+")


@contextmanager
def timed(label):
    started = time.monotonic()
    yield
    print(f"  {label} in {time.monotonic() - started:.1f}s")


def base64url(value):
    raw = value.encode() if isinstance(value, str) else value
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def platform_secret():
    from_environment = os.environ.get(PLATFORM_SECRET_VARIABLE)
    if from_environment:
        return from_environment
    env_file = REPOSITORY_ROOT / PLATFORM_ENV_FILE
    if not env_file.exists():
        return None
    for line in env_file.read_text().splitlines():
        match = PLATFORM_SECRET_PATTERN.match(line)
        if match:
            return match.group(1).strip().strip("\"'")
    return None


def auth_headers():
    secret = platform_secret()
    if not secret:
        return {}
    header = base64url(json.dumps({"alg": "HS256", "typ": "JWT"}))
    claims = base64url(
        json.dumps(
            {
                "sub": TOKEN_SUBJECT,
                "exp": int(time.time()) + TOKEN_LIFETIME_SECONDS,
                "role": TOKEN_ROLE,
            }
        )
    )
    signing_input = f"{header}.{claims}"
    signature = base64url(
        hmac.new(secret.encode(), signing_input.encode(), "sha256").digest()
    )
    return {"Authorization": f"Bearer {signing_input}.{signature}"}


# HEAD on statcan.gc.ca answers with a redirect loop
def remote_total_bytes(url, local_bytes):
    last_byte = local_bytes - 1
    with requests.get(
        url,
        headers={"Range": f"bytes={last_byte}-{last_byte}"},
        stream=True,
        timeout=HTTP_TIMEOUT_SECONDS,
    ) as response:
        if response.status_code != PARTIAL_CONTENT_STATUS:
            return None
        match = CONTENT_RANGE_TOTAL_PATTERN.search(
            response.headers.get("Content-Range", "")
        )
        return int(match.group(1)) if match else None


def download(url, destination):
    local_bytes = destination.stat().st_size if destination.exists() else 0
    if local_bytes:
        total_bytes = remote_total_bytes(url, local_bytes)
        # the census endpoint ignores Range, so a refetch costs the whole 2.2 GB
        if total_bytes is None:
            print(f"have {destination.name}, {local_bytes} bytes, length unconfirmed")
            return 0
        if total_bytes == local_bytes:
            print(f"have {destination.name}, {local_bytes} bytes")
            return 0

    request_headers = {"Range": f"bytes={local_bytes}-"} if local_bytes else {}
    mode = "ab" if local_bytes else "wb"
    with requests.get(
        url, headers=request_headers, stream=True, timeout=HTTP_TIMEOUT_SECONDS
    ) as response:
        if not response.ok:
            raise RuntimeError(f"GET {url} -> {response.status_code}")
        if mode == "ab" and response.status_code != PARTIAL_CONTENT_STATUS:
            mode = "wb"
        fetched = 0
        with destination.open(mode) as handle:
            for chunk in response.iter_content(DOWNLOAD_CHUNK_BYTES):
                handle.write(chunk)
                fetched += len(chunk)
    print(f"downloaded {destination.name}, {fetched} bytes")
    return fetched


class Ptolemy:
    def __init__(self, base_url):
        self.base = base_url.rstrip("/") + "/api/v1"
        self.session = requests.Session()
        self.session.headers.update(
            {"Content-Type": "application/json", **auth_headers()}
        )

    def get(self, path):
        response = self.session.get(self.base + path, timeout=HTTP_TIMEOUT_SECONDS)
        if not response.ok:
            raise RuntimeError(
                f"GET {path} -> {response.status_code}: {response.text[:400]}"
            )
        return response.json()

    def post(self, path, body, timeout=HTTP_TIMEOUT_SECONDS):
        response = self.session.post(
            self.base + path, data=json.dumps(body), timeout=timeout
        )
        if not response.ok:
            raise RuntimeError(
                f"POST {path} -> {response.status_code}: {response.text[:400]}"
            )
        return response.json() if response.text else None


def ensure_dataset(ptolemy, name, geometry_type):
    for dataset in ptolemy.get("/datasets"):
        if dataset["name"] == name:
            return dataset["id"]
    created = ptolemy.post(
        "/datasets",
        {
            "name": name,
            "geometry_type": geometry_type,
            "srid": 4326,
            "created_by": IMPORT_AUTHOR,
        },
    )
    return created["id"]


def ensure_branch(ptolemy, dataset_id, name):
    for branch in ptolemy.get(f"/datasets/{dataset_id}/branches"):
        if branch["name"] == name:
            return branch["id"]
    created = ptolemy.post(
        f"/datasets/{dataset_id}/branches", {"name": name, "created_by": IMPORT_AUTHOR}
    )
    return created["id"]


def delete_all_features(ptolemy, branch_id):
    deleted = 0
    while True:
        page = ptolemy.get(f"/branches/{branch_id}/features?limit={FEATURE_PAGE_SIZE}")
        ids = [feature["id"] for feature in page["features"]]
        if not ids:
            return deleted
        for start in range(0, len(ids), FEATURES_PER_DELETE_COMMIT):
            chunk = ids[start : start + FEATURES_PER_DELETE_COMMIT]
            ptolemy.post(
                f"/branches/{branch_id}/commit",
                {
                    "message": "clear for reload",
                    "author": IMPORT_AUTHOR,
                    "operations": [
                        {"type": "delete", "feature_id": feature_id}
                        for feature_id in chunk
                    ],
                },
                timeout=IMPORT_TIMEOUT_SECONDS,
            )
            deleted += len(chunk)


def prepare_branch(ptolemy, dataset_name, geometry_type, replace):
    dataset_id = ensure_dataset(ptolemy, dataset_name, geometry_type)
    branch_id = ensure_branch(ptolemy, dataset_id, MAIN_BRANCH)
    existing = ptolemy.get(f"/branches/{branch_id}/features/count")["count"]
    if existing and not replace:
        print(
            f"{dataset_name}: {existing} features already present, pass --replace to reload"
        )
        return None
    if existing:
        deleted = delete_all_features(ptolemy, branch_id)
        print(f"{dataset_name}: deleted {deleted} existing features")
    return branch_id


def import_batches(features):
    batch = []
    batch_bytes = 0
    for feature in features:
        encoded_bytes = len(json.dumps(feature))
        over_count = len(batch) >= MAX_FEATURES_PER_IMPORT
        over_bytes = batch_bytes + encoded_bytes > MAX_IMPORT_BODY_BYTES
        if batch and (over_count or over_bytes):
            yield batch
            batch = []
            batch_bytes = 0
        batch.append(feature)
        batch_bytes += encoded_bytes
    if batch:
        yield batch


def import_features(ptolemy, branch_id, features, message):
    imported = 0
    for batch in import_batches(features):
        result = ptolemy.post(
            f"/branches/{branch_id}/import/geojson",
            {
                "type": "FeatureCollection",
                "message": message,
                "author": IMPORT_AUTHOR,
                "features": batch,
            },
            timeout=IMPORT_TIMEOUT_SECONDS,
        )
        imported += result["imported"]
        errors = result.get("errors") or []
        if errors:
            print(f"  {len(errors)} import errors, first: {errors[0]}")
    return imported


def json_value(value):
    if value is None or pandas.isna(value):
        return None
    if hasattr(value, "item"):
        return value.item()
    return value


def geojson_features(geometries, attributes, source):
    for geometry, row in zip(geometries, attributes.itertuples(index=False)):
        properties = {key: json_value(value) for key, value in row._asdict().items()}
        properties["source"] = source
        yield {
            "type": "Feature",
            "geometry": mapping(geometry),
            "properties": properties,
        }


def padded(bbox):
    if bbox is None:
        return None
    minimum_longitude, minimum_latitude, maximum_longitude, maximum_latitude = bbox
    return (
        minimum_longitude - NEIGHBOUR_PADDING_DEGREES,
        minimum_latitude - NEIGHBOUR_PADDING_DEGREES,
        maximum_longitude + NEIGHBOUR_PADDING_DEGREES,
        maximum_latitude + NEIGHBOUR_PADDING_DEGREES,
    )


def parse_stated_area(value):
    if value is None or pandas.isna(value):
        return None
    match = STATED_AREA_PATTERN.search(str(value))
    return float(match.group()) if match else None


def load_parcels(ptolemy, data_dir, bbox, replace):
    branch_id = prepare_branch(ptolemy, PARCELS_DATASET, "POLYGON", replace)
    if branch_id is None:
        return

    with timed("read parcels"):
        parcels = geopandas.read_file(
            data_dir / PROPERTY_BOUNDARIES_FILE,
            engine="pyogrio",
            bbox=bbox,
            columns=["PARCELID", "FEATURE_TYPE", "STATEDAREA"],
        )
    print(f"parcels: {len(parcels)} polygons")
    if parcels.empty:
        print("parcels: nothing in the bbox")
        return

    with timed("read address points"):
        addresses = geopandas.read_file(
            data_dir / ADDRESS_POINTS_FILE,
            engine="pyogrio",
            bbox=padded(bbox),
            columns=["ADDRESS_FULL", "ADDRESS_NUMBER"],
        )
    with timed("read zoning areas"):
        zoning = geopandas.read_file(
            data_dir / ZONING_AREAS_FILE,
            engine="pyogrio",
            bbox=padded(bbox),
            columns=["ZN_ZONE", "ZN_STRING", "PRCNT_COMM", "PRCNT_OFFC", "PRCNT_RES"],
        )
    print(f"parcels: {len(addresses)} address points, {len(zoning)} zoning polygons")

    with timed("join addresses to parcels"):
        address_join = geopandas.sjoin(
            addresses, parcels[["geometry"]], predicate="within"
        )
        address_join["address_number"] = pandas.to_numeric(
            address_join["ADDRESS_NUMBER"], errors="coerce"
        )
        address_join = address_join.sort_values("address_number")
        address_counts = address_join.groupby("index_right").size()
        lowest_address = address_join.groupby("index_right")["ADDRESS_FULL"].first()

    representative_points = geopandas.GeoDataFrame(
        geometry=parcels.geometry.representative_point(), crs=parcels.crs
    )
    with timed("join zoning to parcels"):
        projected_crs = parcels.estimate_utm_crs()
        zoning_join = geopandas.sjoin(
            representative_points.to_crs(projected_crs),
            zoning.to_crs(projected_crs),
            predicate="within",
        )
        zoning_join = zoning_join[~zoning_join.index.duplicated(keep="first")]

    area_sqm = parcels["STATEDAREA"].map(parse_stated_area)

    def zone_column(name):
        return zoning_join[name].reindex(parcels.index)

    def percent(name):
        ratios = pandas.to_numeric(zone_column(name), errors="coerce")
        return ratios.where(ratios >= SMALLEST_REAL_ZONING_RATIO)

    attributes = pandas.DataFrame(
        {
            "apn": parcels["PARCELID"].astype(str),
            "address": lowest_address.reindex(parcels.index),
            "address_count": address_counts.reindex(parcels.index)
            .fillna(0)
            .astype(int),
            "zoning": zone_column("ZN_STRING"),
            "zone_category": zone_column("ZN_ZONE"),
            "percent_commercial": percent("PRCNT_COMM"),
            "percent_office": percent("PRCNT_OFFC"),
            "percent_residential": percent("PRCNT_RES"),
            "land_use": parcels["FEATURE_TYPE"],
            "area_sqm": area_sqm,
            "sqft": area_sqm * SQUARE_FEET_PER_SQUARE_METRE,
            "acres": area_sqm / SQUARE_METRES_PER_ACRE,
            "lat": representative_points.geometry.y,
            "lng": representative_points.geometry.x,
        }
    )
    with_address = int(attributes["address"].notna().sum())
    with_zoning = int(attributes["zoning"].notna().sum())
    print(f"parcels: {with_address} with an address, {with_zoning} with a zone")

    with timed("import parcels"):
        imported = import_features(
            ptolemy,
            branch_id,
            geojson_features(parcels.geometry, attributes, TORONTO_ATTRIBUTION),
            "Toronto property boundaries with zoning and addresses",
        )
    print(f"parcels: imported {imported} features into branch {branch_id}")


def read_dissemination_areas(path, bbox):
    with zipfile.ZipFile(path) as archive:
        shapefile = next(
            name for name in archive.namelist() if name.lower().endswith(".shp")
        )
    areas = geopandas.read_file(
        f"/vsizip/{path}/{shapefile}",
        engine="pyogrio",
        columns=[DISSEMINATION_AREA_ID_COLUMN, DISSEMINATION_GUID_COLUMN],
    )
    print(f"census: boundary file is {areas.crs.name}, {len(areas)} areas in Canada")
    areas = areas[
        areas[DISSEMINATION_AREA_ID_COLUMN].str.startswith(TORONTO_CENSUS_DIVISION)
    ]
    areas = areas.to_crs(WGS84)
    if bbox is not None:
        minimum_longitude, minimum_latitude, maximum_longitude, maximum_latitude = bbox
        areas = areas.cx[
            minimum_longitude:maximum_longitude, minimum_latitude:maximum_latitude
        ]
    return areas.reset_index(drop=True)


def census_number(text):
    cleaned = text.strip().replace(",", "")
    if not CENSUS_NUMBER_PATTERN.fullmatch(cleaned):
        return None
    return float(cleaned)


def read_census_profile(path, wanted_dauids):
    values = {}
    with (
        zipfile.ZipFile(path) as archive,
        archive.open(CENSUS_PROFILE_MEMBER) as raw,
    ):
        reader = csv.reader(io.TextIOWrapper(raw, encoding="latin-1"))
        header = next(reader)
        geo_code = header.index(CENSUS_GEO_CODE_COLUMN)
        characteristic_id = header.index(CENSUS_CHARACTERISTIC_ID_COLUMN)
        characteristic_name = header.index(CENSUS_CHARACTERISTIC_NAME_COLUMN)
        value = header.index(CENSUS_VALUE_COLUMN)
        for row in reader:
            wanted = CENSUS_CHARACTERISTICS.get(row[characteristic_id])
            if wanted is None or row[geo_code] not in wanted_dauids:
                continue
            column, expected_label = wanted
            actual_label = row[characteristic_name].strip()
            if actual_label != expected_label:
                raise RuntimeError(
                    f"characteristic {row[characteristic_id]} is now "
                    f"'{actual_label}', expected '{expected_label}'"
                )
            values.setdefault(row[geo_code], {})[column] = census_number(row[value])
    return values


def load_census(ptolemy, data_dir, bbox, replace):
    branch_id = prepare_branch(ptolemy, CENSUS_DATASET, "POLYGON", replace)
    if branch_id is None:
        return

    with timed("read dissemination area boundaries"):
        areas = read_dissemination_areas(
            data_dir / DISSEMINATION_AREA_BOUNDARIES_FILE, bbox
        )
    print(f"census: {len(areas)} Toronto dissemination areas selected")
    if areas.empty:
        print("census: nothing in the bbox")
        return

    wanted_dauids = set(areas[DISSEMINATION_AREA_ID_COLUMN])
    with timed("scan census profile csv"):
        profile = read_census_profile(data_dir / CENSUS_PROFILE_FILE, wanted_dauids)
    print(f"census: profile rows found for {len(profile)} of {len(areas)} areas")

    attributes = pandas.DataFrame(
        {
            "dauid": areas[DISSEMINATION_AREA_ID_COLUMN],
            "dguid": areas[DISSEMINATION_GUID_COLUMN],
            **{
                column: [
                    profile.get(dauid, {}).get(column)
                    for dauid in areas[DISSEMINATION_AREA_ID_COLUMN]
                ]
                for column in CENSUS_COLUMNS
            },
        }
    )

    geopackage_path = data_dir / CENSUS_GEOPACKAGE_FILE
    with timed("write census geopackage"):
        export = geopandas.GeoDataFrame(
            attributes.assign(source=STATISTICS_CANADA_ATTRIBUTION),
            geometry=areas.geometry,
            crs=areas.crs,
        )
        export.to_file(geopackage_path, driver="GPKG", layer=CENSUS_DATASET)

    with timed("import census areas"):
        imported = import_features(
            ptolemy,
            branch_id,
            geojson_features(areas.geometry, attributes, STATISTICS_CANADA_ATTRIBUTION),
            "2021 census dissemination areas for Toronto",
        )
    print(f"census: imported {imported} features into branch {branch_id}")
    print(f"census: GeoPackage for the viewer at {geopackage_path}")


def parse_bbox(text):
    if text is None:
        return None
    parts = [float(part) for part in text.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("bbox needs minlon,minlat,maxlon,maxlat")
    return tuple(parts)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ptolemy-url", default="http://localhost:3000")
    parser.add_argument("--bbox", type=parse_bbox)
    parser.add_argument("--data-dir", default="data/toronto")
    parser.add_argument("--skip-census", action="store_true")
    parser.add_argument("--skip-parcels", action="store_true")
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    if not data_dir.is_absolute():
        data_dir = REPOSITORY_ROOT / data_dir
    data_dir.mkdir(parents=True, exist_ok=True)

    started = time.monotonic()
    downloaded_bytes = 0
    wanted = []
    if not args.skip_parcels:
        wanted += PARCEL_DOWNLOADS
    if not args.skip_census:
        wanted += CENSUS_DOWNLOADS
    for filename, url in wanted:
        downloaded_bytes += download(url, data_dir / filename)

    ptolemy = Ptolemy(args.ptolemy_url)
    if not args.skip_parcels:
        load_parcels(ptolemy, data_dir, args.bbox, args.replace)
    if not args.skip_census:
        load_census(ptolemy, data_dir, args.bbox, args.replace)

    print(
        f"done in {time.monotonic() - started:.1f}s, "
        f"{downloaded_bytes} bytes downloaded this run"
    )


if __name__ == "__main__":
    main()
