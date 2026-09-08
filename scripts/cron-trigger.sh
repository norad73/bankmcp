#!/bin/sh
set -eu
: "${BANKMCP_HOST:?BANKMCP_HOST is required}"
: "${CRON_SECRET:?CRON_SECRET is required}"
curl -sfS -X POST "https://${BANKMCP_HOST}/cron/sync-balances" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json"
echo
