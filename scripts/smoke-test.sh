#!/bin/sh
set -eu

export COMPOSE_PROJECT_NAME=bianco-smoke
export BIANCO_SYNC_TOKEN=smoke-test-token
export BIANCO_SECRET_KEY=smoke-test-secret-key-at-least-32-characters
export BIANCO_AUTH_USER=smoke-user
export BIANCO_AUTH_PASSWORD_HASH='$2y$05$T2WROzC9udzG22f01YRqC.3GbfaqzFbi04ifCy/HU.F0pON7o6/sm'
export BIANCO_SITE_ADDRESS=:80
export BIANCO_BIND_ADDRESS=127.0.0.1
export BIANCO_HTTP_PORT=8088

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

if docker compose exec -T web wget -qO- http://localhost/ >/dev/null 2>&1; then
  echo "Unauthenticated web access was unexpectedly allowed"
  exit 1
fi
docker compose exec -T web wget -qO- --header='Authorization: Basic c21va2UtdXNlcjpzbW9rZS1wYXNzd29yZA==' http://localhost/ >/dev/null
docker compose exec -T api python -c \
  'import json, os, urllib.request; payload=json.dumps({"checkpoint":{"sequence":0},"batchSize":1}).encode(); request=urllib.request.Request("http://localhost:8000/api/sync/receipts/pull", data=payload, headers={"Authorization":"Bearer "+os.environ["BIANCO_SYNC_TOKEN"], "Content-Type":"application/json"}); urllib.request.urlopen(request)'

echo "Bianco production smoke test passed"
