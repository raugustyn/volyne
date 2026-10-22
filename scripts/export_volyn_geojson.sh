#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/viewer/data"
mkdir -p "$OUT_DIR"

ENV_FILE="$ROOT/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing $ENV_FILE — copy .env.example to .env and fill in the password." >&2
    exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${PGHOST:?Set PGHOST in .env}"
: "${PGUSER:?Set PGUSER in .env}"
: "${PGPASSWORD:?Set PGPASSWORD in .env}"
: "${PGDATABASE:?Set PGDATABASE in .env}"

CONN="host=$PGHOST dbname=$PGDATABASE user=$PGUSER password=$PGPASSWORD"

ogr2ogr -overwrite -f GeoJSON -t_srs EPSG:4326 \
  "$OUT_DIR/volyn_source.geojson" \
  PG:"$CONN" \
  -sql "SELECT * FROM volyn.source WHERE geom IS NOT NULL" \
  -nln source

ogr2ogr -overwrite -f GeoJSON -t_srs EPSG:4326 \
  "$OUT_DIR/volyn_target.geojson" \
  PG:"$CONN" \
  -sql "SELECT * FROM volyn.target WHERE geom IS NOT NULL" \
  -nln target

echo "Exported to $OUT_DIR"
