#!/usr/bin/env bash
set -euo pipefail

app_root="/opt/sketchcatch"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash deploy/ec2/bootstrap-amazon-linux.sh" >&2
  exit 1
fi

if ! command -v dnf >/dev/null 2>&1; then
  echo "Amazon Linux with dnf is required." >&2
  exit 1
fi

dnf install -y docker gzip curl shadow-utils

if ! id sketchcatch >/dev/null 2>&1; then
  useradd --system --home-dir "${app_root}" --shell /usr/sbin/nologin sketchcatch
fi

install -d -m 0755 "${app_root}/images"
install -d -m 0755 /etc/sketchcatch
chown -R sketchcatch:sketchcatch "${app_root}"

systemctl enable --now docker

echo "SketchCatch EC2 bootstrap complete"
