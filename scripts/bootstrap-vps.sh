#!/usr/bin/env bash
# Walkcast: one-box bootstrap for a cheap VPS (Hetzner CX11 / Lightsail / DigitalOcean).
# Run as root on a fresh Ubuntu 22.04+ instance:
#   curl -fsSL https://raw.githubusercontent.com/KunjShah95/browser-user/main/scripts/bootstrap-vps.sh | bash
set -euo pipefail

DOMAIN="${DOMAIN:-}"
SITE_URL="${SITE_URL:-${DOMAIN:+https://$DOMAIN}}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -hex 16)}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (sudo)."; exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates openssl docker.io docker-compose-plugin
systemctl enable --now docker

if [ ! -d /opt/walkcast ]; then
  git clone https://github.com/KunjShah95/browser-user.git /opt/walkcast
fi
cd /opt/walkcast

# Fresh .env unless one was provided by the operator
if [ ! -f .env ]; then
  cat > .env <<EOF
# Built by bootstrap-vps.sh
LAB_SITE_URL=${SITE_URL:-http://127.0.0.1:4320}
LAB_AUTH=off
LAB_WORKER=               # in-process worker; remove this line for multi-instance scale
LAB_WARM_BROWSER=1
LAB_ALLOW_LIVE_RUNS=0
LAB_SECRET_KEY=$(openssl rand -base64 32)
DATABASE_URL=postgres://walkcast:${DB_PASSWORD}@db:5432/walkcast
SUPABASE_DB_URL=
LAB_CHROMIUM_SANDBOX=0
LAB_FFMPEG=ffmpeg
LAB_FFPROBE=ffprobe
LAB_LOG=json
EOF
fi

# One public IP default; Caddy sits in front and gives TLS for free
if [ -n "$DOMAIN" ] && [ ! -d /opt/caddy ]; then
  mkdir -p /opt/caddy
  docker run -d --name caddy --restart unless-stopped \
    -p 80:80 -p 443:443 \
    -v /opt/caddy/Caddyfile:/etc/caddy/Caddyfile:ro \
    -v /opt/caddy/data:/data \
    caddy:2-alpine true
  echo "$DOMAIN { reverse_proxy walkcast:4320 }" > /opt/caddy/Caddyfile
fi

docker compose --env-file .env up --build -d migrate
docker compose --env-file .env up --build -d web worker

echo "=================================================="
echo " Walkcast is up on :4320"
echo " Site URL: ${SITE_URL:-http://127.0.0.1:4320}"
echo " Health: curl -s http://127.0.0.1:4320/readyz"
echo " Logs:   docker compose --env-file .env logs -f web worker"
echo "=================================================="