#!/usr/bin/env bash
# Production deploy for People (HRM). Run on the server by the CI deploy job
# (.github/workflows/deploy.yml) as:   bash "$APP_DIR/deploy.sh"
# APP_DIR is this checkout of aZul-tech/hrm-system on the main branch.
#
# 1. Updates this checkout to the latest main.
# 2. Backs up the live database (the new version may migrate it on start).
# 3. Rebuilds and restarts the container.
#
# Everything runs inside main() so bash reads the whole script before
# `git pull` can replace this file mid-run.
set -euo pipefail

CONTAINER=azul-tech-hrm
BACKUP_KEEP_DAYS=14

main() {
  cd "$(dirname "$0")"

  if [ ! -f server/.env ]; then
    echo "server/.env is missing - copy server/.env.example and fill it in first." >&2
    exit 1
  fi

  echo "==> Updating code to latest main"
  git fetch --prune
  git checkout main
  git pull --ff-only

  echo "==> Backing up the database"
  if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    local stamp
    stamp=$(date +%Y%m%d-%H%M%S)
    docker exec -w /app/server "$CONTAINER" \
      node -e "require('./src/db').exec(\"VACUUM INTO 'data/backup-${stamp}.db'\")"
    docker exec "$CONTAINER" find /app/server/data -name 'backup-*.db' -mtime +"$BACKUP_KEEP_DAYS" -delete
    echo "    saved data/backup-${stamp}.db (inside the hrm-data volume)"
  else
    echo "    container not running yet - nothing to back up"
  fi

  echo "==> Rebuilding and restarting"
  docker compose up -d --build --force-recreate
  docker image prune -f >/dev/null

  echo "==> Deploy finished"
}

main "$@"
