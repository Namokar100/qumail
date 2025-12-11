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
docker compose up -d

# 3. Wait for Mail Server
echo "[3/4] Waiting for mail server to be ready (this may take a moment)..."
# Loop until the container is healthy
until [ "`docker inspect -f {{.State.Health.Status}} mail`" == "healthy" ]; do
    sleep 2
    echo -n "."
done
echo " Ready!"

# 4. Create Default User (if not exists)
echo "[4/4] Checking default user..."
# Check if user exists by listing and grepping. If grep fails, user doesn't exist.
if ! docker exec mail setup email list | grep -q "user@qumail.local"; then
    echo "Creating default user: user@qumail.local / password123"
    docker exec mail setup email add user@qumail.local password123
else
    echo "Default user already exists."
fi

# 5. DKIM Setup (Optional but good)
if [ ! -f "data/dkim/qumail.local_mail/mail.private" ]; then
    echo "Generating DKIM keys..."
    docker exec mail setup config dkim domain 'qumail.local' || true
fi

echo ""
echo "=== System is Online ==="
echo "Webmail: http://localhost:8080"
echo "Login:   user@qumail.local"
echo "Pass:    password123"
echo ""
echo "To stop: docker compose down"
