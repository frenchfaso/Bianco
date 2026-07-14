#!/bin/sh
set -eu

export COMPOSE_PROJECT_NAME=bianco-smoke
export BIANCO_SYNC_TOKEN=smoke-test-token
export BIANCO_SITE_ADDRESS=:80
export BIANCO_HTTP_PORT=8088
export BIANCO_HTTPS_PORT=8443

cleanup() {
  docker compose down -v --remove-orphans
}
trap cleanup EXIT INT TERM

docker compose up -d --build

attempt=0
until docker compose exec -T api python -c \
  'import urllib.request; urllib.request.urlopen("http://localhost:8000/api/health/ready")'; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    docker compose logs api web
    exit 1
  fi
  sleep 2
done

docker compose exec -T web wget -qO- http://localhost/ >/dev/null
docker compose exec -T api python -c \
  'import json, os, urllib.request; payload=json.dumps({"checkpoint":{"sequence":0},"batchSize":1}).encode(); request=urllib.request.Request("http://localhost:8000/api/sync/receipts/pull", data=payload, headers={"Authorization":"Bearer "+os.environ["BIANCO_SYNC_TOKEN"], "Content-Type":"application/json"}); urllib.request.urlopen(request)'

echo "Bianco production smoke test passed"
