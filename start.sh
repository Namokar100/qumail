#!/bin/bash
set -e

echo "=== QuMail Startup Script ==="

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
if ! docker exec mail setup email list 2>/dev/null | grep -q "user@qumail.work.gd"; then
    echo "Creating default user: user@qumail.work.gd / password123"
    docker exec mail setup email add user@qumail.work.gd password123 || true
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
if [ ! -f "data/dkim/qumail.work.gd_mail/mail.private" ]; then
    echo "Generating DKIM keys..."
    docker exec mail setup config dkim domain 'qumail.work.gd' || true
fi

echo ""
echo "=== System is Online ==="
echo "Webmail: https://mail.qumail.work.gd"
echo "Login:   user@qumail.work.gd"
echo "Pass:    password123"
echo ""
echo "To stop: docker compose down (or docker-compose down)"
