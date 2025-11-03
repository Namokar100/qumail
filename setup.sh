#!/bin/bash
# QuMail setup script for WSL

set -e

echo "=== QuMail Local Setup ==="

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "Error: Docker not found. Install Docker Desktop for Windows."
    exit 1
fi

# Start containers
echo "Starting mail server..."
docker compose up -d

# Wait for mail container
echo "Waiting for mail server to initialize..."
sleep 10

# Add default user
echo "Creating test user: alice@qumail.local"
docker exec -it mail setup email add alice@qumail.local password123 || true

# Generate DKIM
echo "Generating DKIM keys..."
docker exec -it mail setup config dkim || true

echo ""
echo "=== Setup Complete ==="
echo "Webmail: http://localhost:8080"
echo "Username: alice@qumail.local"
echo "Password: password123"
echo ""
echo "View logs: docker compose logs -f mail"
