#!/usr/bin/env bash
set -euo pipefail

DOMAIN=${DOMAIN:-qumail.work.gd}
ENVIRONMENT=${ENVIRONMENT:-local}

echo "Creating required directories..."
mkdir -p data/maildata data/mailstate data/maillogs data/dkim data/db data/ssl config

echo "Setting permissions..."
chmod -R 700 data/maildata data/mailstate data/db || true
chmod -R 755 data/maillogs || true
chmod -R 700 data/dkim || true

if [ "$ENVIRONMENT" != "prod" ]; then
  if [ ! -f data/ssl/fullchain.pem ]; then
    echo "Generating self-signed certificate for mail.${DOMAIN}..."
  
  # Create a temporary config file to avoid "missing openssl.cfg" errors on Windows
  # and to provide a robust configuration source.
  cat > openssl_temp.cnf <<EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
C = IN
ST = KA
L = Bangalore
O = QuMail
CN = mail.${DOMAIN}

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = mail.${DOMAIN}
DNS.2 = localhost
EOF

  # Generate the certificate using the temporary config file
  # We export OPENSSL_CONF to /dev/null to prevent interference from system env vars,
  # but rely on -config explicitly pointing to our file.
  OPENSSL_CONF="/dev/null" openssl req -x509 -nodes -days 365 \
    -newkey rsa:2048 \
    -keyout data/ssl/privkey.pem \
    -out data/ssl/fullchain.pem \
    -config openssl_temp.cnf || \
    (echo "OpenSSL generation failed!" && rm -f openssl_temp.cnf && exit 1)

  # Cleanup
  rm -f openssl_temp.cnf
  fi
fi

echo "Folders & certificates ready."
