#!/bin/sh
set -eu
: "${BANKCONNECTOR_HOST:?BANKCONNECTOR_HOST is required}"
: "${CRON_SECRET:?CRON_SECRET is required}"
curl -sfS -X POST "https://${BANKCONNECTOR_HOST}/cron/refresh-balances" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json"
echo
curl -sfS -X POST "https://${BANKCONNECTOR_HOST}/cron/sync-balances" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json"
echo
