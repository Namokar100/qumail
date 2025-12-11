#!/usr/bin/env bash
set -euo pipefail

echo "Creating required directories..."
mkdir -p data/maildata data/mailstate data/maillogs data/dkim data/db data/ssl config

echo "Setting permissions..."
chmod -R 700 data/maildata data/mailstate data/db || true
chmod -R 755 data/maillogs || true
chmod -R 700 data/dkim || true

if [ ! -f data/ssl/fullchain.pem ]; then
  echo "Generating self-signed certificate for mail.qumail.local..."
  openssl req -x509 -nodes -days 365 \
    -newkey rsa:2048 \
    -keyout data/ssl/privkey.pem \
    -out data/ssl/fullchain.pem \
    -subj "/C=IN/ST=KA/L=Bangalore/O=QuMail/CN=mail.qumail.local"
fi

echo "Folders & certificates ready."
