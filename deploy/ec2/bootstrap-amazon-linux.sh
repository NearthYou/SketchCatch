#!/usr/bin/env bash
set -euo pipefail

app_root="/opt/sketchcatch"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash deploy/ec2/bootstrap-amazon-linux.sh" >&2
  exit 1
fi

if command -v dnf >/dev/null 2>&1; then
  dnf install -y docker gzip shadow-utils
  if ! command -v curl >/dev/null 2>&1; then
    dnf install -y curl --allowerasing
  fi
elif command -v yum >/dev/null 2>&1; then
  if command -v amazon-linux-extras >/dev/null 2>&1; then
    amazon-linux-extras install -y docker || yum install -y docker
  else
    yum install -y docker
  fi

  yum install -y gzip shadow-utils || yum install -y gzip
  if ! command -v curl >/dev/null 2>&1; then
    yum install -y curl
  fi
else
  echo "Amazon Linux with dnf or yum is required." >&2
  exit 1
fi

nologin_shell="/usr/sbin/nologin"
if [ ! -x "${nologin_shell}" ]; then
  nologin_shell="/sbin/nologin"
fi

if ! id sketchcatch >/dev/null 2>&1; then
  useradd --system --home-dir "${app_root}" --shell "${nologin_shell}" sketchcatch
fi

install -d -m 0755 "${app_root}/images"
install -d -m 0755 /etc/sketchcatch
chown -R sketchcatch:sketchcatch "${app_root}"

systemctl enable --now docker

echo "SketchCatch EC2 bootstrap complete"
