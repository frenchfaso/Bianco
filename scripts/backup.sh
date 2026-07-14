#!/bin/sh
set -eu

destination=${1:-"./backups/bianco-$(date +%Y%m%d-%H%M%S).sqlite"}
filename=$(basename "$destination")
mkdir -p "$(dirname "$destination")"

docker compose exec -T api python -m app.cli.backup "/data/backups/$filename"
docker compose cp "api:/data/backups/$filename" "$destination"

echo "Backup saved to $destination"
