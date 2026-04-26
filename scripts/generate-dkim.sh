#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | awk '/=/ {print $1}')
fi

DOMAIN=${1:-${DOMAIN:-qumail.work.gd}}
SELECTOR=${2:-mail}

OUTDIR="data/dkim/${DOMAIN}_${SELECTOR}"
mkdir -p "$OUTDIR"

openssl genrsa -out "$OUTDIR/${SELECTOR}.private" 2048
openssl rsa -in "$OUTDIR/${SELECTOR}.private" -pubout -out "$OUTDIR/${SELECTOR}.public"

PUBKEY=$(sed -e '1d;$d' "$OUTDIR/${SELECTOR}.public" | tr -d '\n')

echo "DKIM record:"
echo "Record name: ${SELECTOR}._domainkey.${DOMAIN}"
echo "Record value: v=DKIM1; k=rsa; p=${PUBKEY}"
