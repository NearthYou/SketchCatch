#!/usr/bin/env bash
set -euo pipefail

release_id="${RELEASE_ID:?RELEASE_ID is required}"
release_url="${RELEASE_URL:?RELEASE_URL is required}"
app_root="/opt/sketchcatch"
image_archive="${app_root}/images/sketchcatch-${release_id}.tar.gz"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root" >&2
  exit 1
fi

if [ ! -f /etc/sketchcatch/web.env ]; then
  echo "Missing /etc/sketchcatch/web.env" >&2
  exit 1
fi

if [ ! -f /etc/sketchcatch/api.env ]; then
  echo "Missing /etc/sketchcatch/api.env" >&2
  exit 1
fi

install -d -m 0755 "${app_root}/images"
curl --fail --location "${release_url}" --output "${image_archive}"
gzip -dc "${image_archive}" | docker load

docker network create sketchcatch >/dev/null 2>&1 || true

docker rm -f sketchcatch-nginx sketchcatch-web sketchcatch-api >/dev/null 2>&1 || true

docker run -d \
  --name sketchcatch-api \
  --network sketchcatch \
  --env-file /etc/sketchcatch/api.env \
  --restart unless-stopped \
  "sketchcatch-api:${release_id}"

docker run -d \
  --name sketchcatch-web \
  --network sketchcatch \
  --env-file /etc/sketchcatch/web.env \
  --restart unless-stopped \
  "sketchcatch-web:${release_id}"

docker run -d \
  --name sketchcatch-nginx \
  --network sketchcatch \
  -p 80:80 \
  --restart unless-stopped \
  "sketchcatch-nginx:${release_id}"

echo "${release_id}" > "${app_root}/current-image"

sleep 3
curl --fail --silent --show-error http://127.0.0.1/ >/dev/null
curl --fail --silent --show-error http://127.0.0.1/health >/dev/null

echo "SketchCatch Docker release activated: ${release_id}"
