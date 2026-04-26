#!/bin/bash
set -e

echo "=== QuMail Startup Script ==="

if [ ! -f .env ]; then
    echo "Notice: .env not found. Creating a default .env from .env.example..."
    cp .env.example .env
fi

if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | awk '/=/ {print $1}')
fi

# Default fallbacks
export DOMAIN=${DOMAIN:-qumail.work.gd}
export ENVIRONMENT=${ENVIRONMENT:-local}

echo "Checking configuration files..."
if [ ! -f config/postfix-accounts.cf ]; then
    echo "Initializing postfix-accounts.cf from template..."
    sed "s/\${DOMAIN}/$DOMAIN/g" config/postfix-accounts.cf.template > config/postfix-accounts.cf
else
    echo "config/postfix-accounts.cf already exists. Skipping template generation to preserve user accounts."
fi

if [ ! -f config/rspamd/override.d/dkim_signing.conf ]; then
    echo "Initializing dkim_signing.conf from template..."
    sed "s/\${DOMAIN}/$DOMAIN/g" config/rspamd/override.d/dkim_signing.conf.template > config/rspamd/override.d/dkim_signing.conf
fi

# 1. Setup Folders & SSL
echo "[1/4] Setting up directories and SSL certificates..."
if [ -f "./scripts/setup-mail-folders.sh" ]; then
    bash ./scripts/setup-mail-folders.sh
else
    echo "Error: ./scripts/setup-mail-folders.sh not found!"
    exit 1
fi

# 2. Start Containers
echo "[2/4] Starting Docker containers..."
if command -v docker-compose &> /dev/null; then
    docker-compose up -d
else
    docker compose up -d
fi

# 3. Create Default User (Crucial to unblock startup)
echo "[3/4] Creating default user to unblock startup..."
# We wait a few seconds for the container to actually be "running" enough to accept exec
sleep 15
if ! docker exec mail setup email list 2>/dev/null | grep -q "user@${DOMAIN}"; then
    echo "Creating default user: user@${DOMAIN} / password123"
    docker exec mail setup email add user@${DOMAIN} password123 || true
else
    echo "Default user already exists."
fi

# 4. Wait for Mail Server
echo "[4/4] Waiting for mail server to be ready..."
# Loop until the container is healthy
until [ "`docker inspect -f {{.State.Health.Status}} mail`" == "healthy" ]; do
    sleep 2
    echo -n "."
done
echo " Ready!"

# 5. DKIM Setup (Optional but good)
if [ ! -f "data/dkim/${DOMAIN}_mail/mail.private" ]; then
    echo "Generating DKIM keys..."
    docker exec mail setup config dkim domain "${DOMAIN}" || true
fi

echo ""
echo "=== System is Online ==="
echo "Webmail: https://mail.${DOMAIN}"
echo "Login:   user@${DOMAIN}"
echo "Pass:    password123"
echo ""
echo "To stop: docker compose down (or docker-compose down)"
