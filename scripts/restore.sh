#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 BACKUP.sqlite" >&2
  exit 2
fi

source_file=$1
test -f "$source_file"

docker compose cp "$source_file" api:/data/backups/restore-input.sqlite
docker compose stop api
docker compose run --rm --no-deps api python -m app.cli.restore /data/backups/restore-input.sqlite
docker compose start api

echo "Restore completed from $source_file"
