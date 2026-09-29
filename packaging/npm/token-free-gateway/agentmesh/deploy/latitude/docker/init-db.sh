#!/bin/bash
# Vendored verbatim from latitude-dev/latitude-llm development docker/init-db.sh.
# Ran once by the postgres image on first volume initialization: creates the
# restricted runtime user (RLS-subject) used by LAT_DATABASE_URL.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER ${POSTGRES_RUNTIME_USER:-latitude_app} WITH PASSWORD '${POSTGRES_RUNTIME_PASSWORD:-secret}';
    GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO ${POSTGRES_RUNTIME_USER:-latitude_app};
EOSQL
