#!/bin/bash
set -e

# agora keeps its documents in its own database on the shared instance.
# this only runs when the pgdata volume is fresh. an existing stack needs
# the same thing once by hand:
#   docker compose -f docker-compose.platform.yml exec db \
#     psql -U ptolemy -c 'CREATE DATABASE agora'
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -c 'CREATE DATABASE agora'
