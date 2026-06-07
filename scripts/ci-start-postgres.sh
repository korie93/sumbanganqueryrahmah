#!/usr/bin/env bash
set -euo pipefail

: "${PG_HOST:=127.0.0.1}"
: "${PG_PORT:=5432}"
: "${PG_USER:?PG_USER is required}"
: "${PG_PASSWORD:?PG_PASSWORD is required}"
: "${PG_DATABASE:?PG_DATABASE is required}"

if [ "${PG_USER}" != "postgres" ]; then
  echo "CI PostgreSQL bootstrap currently supports PG_USER=postgres only." >&2
  exit 1
fi

if ! [[ "${PG_PORT}" =~ ^[0-9]+$ ]]; then
  echo "PG_PORT must be numeric." >&2
  exit 1
fi

if ! [[ "${PG_DATABASE}" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]]; then
  echo "PG_DATABASE must be a safe PostgreSQL identifier." >&2
  exit 1
fi

if ! [[ "${PG_PASSWORD}" =~ ^[A-Za-z0-9._:@%+=,-]{16,}$ ]]; then
  echo "PG_PASSWORD must use CI-safe password characters and be at least 16 characters." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1 || ! command -v pg_isready >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y postgresql postgresql-contrib
fi

start_postgres() {
  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl start postgresql
  else
    sudo service postgresql start
  fi
}

if ! start_postgres; then
  sudo apt-get update
  sudo apt-get install -y postgresql postgresql-contrib
  start_postgres
fi

for _ in {1..30}; do
  if sudo -u postgres pg_isready -q; then
    break
  fi
  sleep 1
done

sudo -u postgres psql --no-psqlrc --set=ON_ERROR_STOP=1 --quiet <<SQL
ALTER USER postgres WITH PASSWORD '${PG_PASSWORD}';
SQL

if ! sudo -u postgres psql --no-psqlrc --set=ON_ERROR_STOP=1 --quiet --tuples-only \
  -c "SELECT 1 FROM pg_database WHERE datname = '${PG_DATABASE}'" | grep -q 1; then
  sudo -u postgres createdb "${PG_DATABASE}"
fi

for _ in {1..30}; do
  if PGPASSWORD="${PG_PASSWORD}" pg_isready -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DATABASE}" -q; then
    echo "CI PostgreSQL is ready at ${PG_HOST}:${PG_PORT}/${PG_DATABASE}."
    exit 0
  fi
  sleep 1
done

echo "CI PostgreSQL did not become ready in time." >&2
exit 1
