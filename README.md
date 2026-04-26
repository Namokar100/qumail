# QuMail: Post-Quantum Secure Mail Server

QuMail is a post-quantum secure mail server featuring End-to-End (E2E) PQC encryption, conventional SMTP/IMAP federation, and a quantum-safe proxy boundary.

## Prerequisites
- Docker & Docker Compose
- Bash / WSL (if on Windows)
- OpenSSL (optional, if generating keys natively)

## Setup & Running the Project

Because this repository strictly manages secrets, **no `.pem` or `.key` confidential files are checked into Git**. You will need to generate them on your machine before running the project.

### 1. Environment Variables
First, set up your local environment file:
```bash
cp .env.example .env
```

### 2. Generate PQC Proxy Certificates
The NGINX PQC proxy boundary requires its own certificates `pqc_cert.pem` and `pqc_key.pem` inside `config/nginx/ssl/`.
You can generate test certificates using the Open Quantum Safe OpenSSL image, or use standard RSA ones for local testing:

**Option A - Classical Fallback Keys (Easiest for local testing):**
```bash
mkdir -p config/nginx/ssl
openssl req -x509 -newkey rsa:2048 -keyout config/nginx/ssl/pqc_key.pem -out config/nginx/ssl/pqc_cert.pem -nodes -subj "//CN=qumail PQC" -days 365
```
*(Note for Windows users: Notice the double `//CN` to prevent MSYS path conversion issues).*

**Option B - True PQC Keys (Dilithium3):**
To strictly use quantum-safe signatures for the proxy, you will need an OQS-OpenSSL environment (or you can use Docker):
```bash
docker run --rm -v "${PWD}/config/nginx/ssl:/ssl" openquantumsafe/curl sh -c "cd /ssl && openssl req -x509 -new -newkey dilithium3 -keyout pqc_key.pem -out pqc_cert.pem -nodes -subj '/CN=qumail PQC' -days 365"
```

### 3. Start the Server
Once your `.env` and `pqc_key.pem`/`pqc_cert.pem` are created, you can start the application!

```bash
bash start.sh
```

**What `start.sh` automatic actions cover:**
- It creates all necessary `data/` directories.
- It triggers `./scripts/setup-mail-folders.sh` to generate the inner classical `privkey.pem` and `fullchain.pem` for the Postfix/Dovecot container.
- It starts Docker Compose.
- It provisions the default `user@` mailbox.

### 4. Access the Platform
- **Webmail / HTTPS UI:** `https://localhost:1443` (or your `$DOMAIN` if configured)
- **SMTP/IMAP PQC Proxy Ports:** `1025` and `1143`
- **Default Login:** Check the output of `start.sh` (defaults to `user@qumail.local` / `password123`)

## Useful Commands

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# View all logs
docker compose logs -f

# Enter mail container
docker exec -it mail bash

# List users
docker exec -it mail setup email list

# Add user
docker exec -it mail setup email add user@qumail.local password

# Delete user
docker exec -it mail setup email del user@qumail.local

# Restart mail service
docker compose restart mail
```
