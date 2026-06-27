#!/usr/bin/env bash
set -euo pipefail

release_id="${RELEASE_ID:?RELEASE_ID is required}"
release_url="${RELEASE_URL:?RELEASE_URL is required}"
app_root="/opt/sketchcatch"
image_archive="${app_root}/images/sketchcatch-${release_id}.tar.gz"
terraform_plugin_cache_dir="${TF_PLUGIN_CACHE_DIR:-/var/cache/sketchcatch/terraform-plugin-cache}"
cloudwatch_logs_enabled="${CLOUDWATCH_LOGS_ENABLED:-false}"
cloudwatch_log_group_prefix="${CLOUDWATCH_LOG_GROUP_PREFIX:-/sketchcatch/production}"
aws_region="${AWS_REGION:-ap-northeast-2}"

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
install -d -m 0755 "${terraform_plugin_cache_dir}"
curl --fail --location "${release_url}" --output "${image_archive}"
gzip -dc "${image_archive}" | docker load

docker network create sketchcatch >/dev/null 2>&1 || true

docker rm -f sketchcatch-nginx sketchcatch-web sketchcatch-api >/dev/null 2>&1 || true

api_log_options=()
web_log_options=()
nginx_log_options=()
if [ "${cloudwatch_logs_enabled}" = "true" ]; then
  api_log_options=(
    --log-driver awslogs
    --log-opt "awslogs-region=${aws_region}"
    --log-opt awslogs-create-group=true
    --log-opt "awslogs-group=${cloudwatch_log_group_prefix}/api"
    --log-opt "awslogs-stream=${release_id}/api"
  )
  web_log_options=(
    --log-driver awslogs
    --log-opt "awslogs-region=${aws_region}"
    --log-opt awslogs-create-group=true
    --log-opt "awslogs-group=${cloudwatch_log_group_prefix}/web"
    --log-opt "awslogs-stream=${release_id}/web"
  )
  nginx_log_options=(
    --log-driver awslogs
    --log-opt "awslogs-region=${aws_region}"
    --log-opt awslogs-create-group=true
    --log-opt "awslogs-group=${cloudwatch_log_group_prefix}/nginx"
    --log-opt "awslogs-stream=${release_id}/nginx"
  )
fi

docker run -d \
  --name sketchcatch-api \
  --network sketchcatch \
  --env-file /etc/sketchcatch/api.env \
  -v "${terraform_plugin_cache_dir}:${terraform_plugin_cache_dir}" \
  "${api_log_options[@]}" \
  --restart unless-stopped \
  "sketchcatch-api:${release_id}"

docker run -d \
  --name sketchcatch-web \
  --network sketchcatch \
  --env-file /etc/sketchcatch/web.env \
  "${web_log_options[@]}" \
  --restart unless-stopped \
  "sketchcatch-web:${release_id}"

docker run -d \
  --name sketchcatch-nginx \
  --network sketchcatch \
  -p 80:80 \
  "${nginx_log_options[@]}" \
  --restart unless-stopped \
  "sketchcatch-nginx:${release_id}"

echo "${release_id}" > "${app_root}/current-image"

sleep 3
curl --fail --silent --show-error http://127.0.0.1/ >/dev/null
curl --fail --silent --show-error http://127.0.0.1/health >/dev/null

echo "SketchCatch Docker release activated: ${release_id}"
