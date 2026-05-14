#!/usr/bin/env bash
set -euo pipefail

# Kill any process listening on 3000 or 3001
for PORT in 3000 3001; do
  PIDS=$(lsof -ti TCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "Freeing port $PORT (pids: $PIDS)..."
    kill $PIDS
  fi
done

# Give the OS a moment to release the ports
sleep 1

# Ensure infra containers are running
echo "Starting Docker services..."
docker compose up -d

# Run migrations (idempotent)
echo "Running migrations..."
pnpm db:migrate

# Start everything
echo "Starting dev servers..."
exec pnpm dev
