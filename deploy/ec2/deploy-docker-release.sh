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
healthcheck_url="http://127.0.0.1/health"
root_url="http://127.0.0.1/"
healthcheck_timeout_seconds="${HEALTHCHECK_TIMEOUT_SECONDS:-60}"

print_container_diagnostics() {
  echo "SketchCatch container diagnostics:" >&2
  docker ps -a --filter "name=sketchcatch-" >&2 || true

  for container_name in sketchcatch-api sketchcatch-web sketchcatch-nginx; do
    echo "---- docker logs ${container_name} ----" >&2
    docker logs --tail 200 "${container_name}" >&2 || true
  done
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local deadline=$((SECONDS + healthcheck_timeout_seconds))

  until curl --fail --silent --show-error "${url}" >/dev/null; do
    if [ "${SECONDS}" -ge "${deadline}" ]; then
      echo "Timed out waiting for ${label}: ${url}" >&2
      return 1
    fi
    sleep 2
  done
}

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

if ! wait_for_http "${healthcheck_url}" "API health check"; then
  print_container_diagnostics
  exit 1
fi

if ! wait_for_http "${root_url}" "web root"; then
  print_container_diagnostics
  exit 1
fi

echo "SketchCatch Docker release activated: ${release_id}"
