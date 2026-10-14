#!/usr/bin/env bash
# Local development: start the FastAPI backend and Angular frontend together.
#
#   ./dev.sh              install anything missing, run migrations, start both servers
#   ./dev.sh --seed       same, plus load demo categories/products first
#
# Backend:  http://localhost:8000  (API docs at /docs)
# Frontend: http://localhost:4200  (admin portal at /admin)
# Ctrl+C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
SEED=false
[[ "${1:-}" == "--seed" ]] && SEED=true

log() { printf '\033[1;36m[dev]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[dev]\033[0m %s\n' "$*" >&2; exit 1; }

# --- PostgreSQL --------------------------------------------------------------
command -v pg_isready >/dev/null || fail "PostgreSQL not found. Install it: brew install postgresql@17"
if ! pg_isready -q; then
  log "PostgreSQL is not running; trying to start it with Homebrew..."
  brew services start postgresql@17 >/dev/null 2>&1 || true
  for _ in {1..10}; do pg_isready -q && break; sleep 1; done
  pg_isready -q || fail "PostgreSQL is still not running. Start it and try again."
fi
for db in clothing_store clothing_store_test; do
  if ! psql -lqt | cut -d '|' -f 1 | grep -qw "$db"; then
    log "Creating database $db"
    createdb "$db"
  fi
done

# --- Backend setup -----------------------------------------------------------
cd "$BACKEND"
if [[ ! -x .venv/bin/python ]]; then
  log "Creating Python virtualenv and installing backend dependencies"
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements-dev.txt
fi
if [[ ! -f .env ]]; then
  log "Creating backend/.env from .env.example with a random JWT_SECRET"
  secret="$(.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(48))')"
  sed "s|^JWT_SECRET=.*|JWT_SECRET=$secret|" .env.example > .env
fi
log "Applying database migrations"
.venv/bin/alembic upgrade head
if $SEED; then
  log "Loading demo data"
  .venv/bin/python -m scripts.seed_demo
fi

# --- Frontend setup ----------------------------------------------------------
cd "$FRONTEND"
if [[ ! -d node_modules ]]; then
  log "Installing frontend dependencies"
  npm install
fi

# --- Run both ----------------------------------------------------------------
pids=()
# npx and uvicorn --reload spawn child processes, so stop each whole process tree.
kill_tree() {
  local child
  for child in $(pgrep -P "$1"); do kill_tree "$child"; done
  kill "$1" 2>/dev/null || true
}
cleanup() {
  trap - INT TERM EXIT
  log "Stopping servers..."
  for pid in "${pids[@]}"; do kill_tree "$pid"; done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

log "Starting backend on http://localhost:8000"
(cd "$BACKEND" && exec .venv/bin/uvicorn app.main:app --reload --port 8000) &
pids+=($!)

log "Starting frontend on http://localhost:4200"
(cd "$FRONTEND" && exec npx ng serve --port 4200) &
pids+=($!)

# Exit as soon as either server stops, taking the other one down with it.
# (Polling instead of `wait -n`, which macOS's bash 3.2 lacks.)
while kill -0 "${pids[0]}" 2>/dev/null && kill -0 "${pids[1]}" 2>/dev/null; do sleep 1; done
