# QuMail - Local Mail Server with PQC Support

Local mail stack for testing and development, with future PQC (Post-Quantum Cryptography) integration.

## Stack Components

- **Postfix** - MTA (SMTP server)
- **Dovecot** - IMAP/POP3 server
- **Rspamd** - Spam filtering
- **OpenDKIM** - DKIM signing
- **Roundcube** - Webmail interface

## Prerequisites

- Docker Desktop for Windows
- WSL2 enabled
- Git
- 4GB RAM minimum
- 10GB free disk space

## Quick Start

### 1. Clone and setup

```bash
git clone <repository-url>
cd qumail
cp mail.env.example mail.env
```

### 2. Start the mail server

```bash
docker compose up -d
```

### 3. Add a test user

```bash
docker exec -it mail setup email add alice@qumail.local password123
```

### 4. Access webmail

Open browser: http://localhost:8080

Login:
- Username: `alice@qumail.local`
- Password: `password123`

## Testing

### Send test email (from WSL/PowerShell with swaks installed)

```bash
swaks --to alice@qumail.local --server localhost --from test@localhost --body "Test message"
```

### View logs

```bash
docker compose logs -f mail
```

### Check mail delivery

```bash
docker exec -it mail ls -la /var/mail/qumail.local/alice/new/
```

## Project Structure

```
qumail/
├── docker-compose.yml    # Container orchestration
├── mail.env             # Mail server configuration
├── config/              # Custom mail server configs
├── data/
│   ├── maildata/        # User mailboxes (Maildir)
│   ├── mailstate/       # Server state
│   ├── maillogs/        # SMTP/IMAP logs
│   └── dkim/            # DKIM keys
└── README.md
```

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

## Next Steps (PQC Integration)

1. Set up key management service
2. Integrate liboqs for PQC algorithms
3. Implement hybrid encryption (classical + PQC)
4. Add WKD (Web Key Directory) for key discovery
5. Modify Roundcube for E2E encryption UI
6. Test interoperability with PQC-enabled clients

## Security Notes

⚠️ **For local development only!**

- SSL/TLS is disabled
- Default passwords in documentation
- No firewall rules
- Not suitable for production

**Never expose ports to the internet without proper security configuration.**

## Troubleshooting

### Port conflicts
If ports 25, 587, 993, or 8080 are in use:
```bash
# Check what's using the port (PowerShell)
netstat -ano | findstr :25
```

### Container won't start
```bash
# Check logs
docker compose logs mail

# Remove and recreate
docker compose down -v
docker compose up -d
```

### Can't send/receive mail
- Check firewall settings
- Verify container networking: `docker network inspect qumail_default`
- Check DNS resolution inside container: `docker exec -it mail nslookup mail.qumail.local`

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - See LICENSE file for details
