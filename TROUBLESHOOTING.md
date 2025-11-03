# Troubleshooting Guide

## SMTP Error: [451] 4.3.0 Error: queue file write error

### Cause
Postfix couldn't write to its queue directory due to:
- Missing or incorrect permissions on `/var/spool/postfix`
- Disk space issues
- Volume mount problems in Docker

### Solution ✅
Added `tmpfs` mounts in docker-compose.yml for Postfix queue directories:

```yaml
tmpfs:
  - /var/spool/postfix
  - /var/lib/rspamd
```

This creates in-memory filesystems for the queue, which:
- Ensures proper permissions
- Improves performance
- Avoids disk I/O issues

### Verification
```bash
# Check queue is working
docker exec mail postqueue -p

# Should show: "Mail queue is empty"

# Send test email
docker exec mail bash -c "echo 'Subject: Test\n\nBody' | sendmail alice@qumail.local"

# Check delivery
docker exec mail ls -la /var/mail/qumail.local/alice/new/
```

---

## Connection to storage server failed

### Cause
Roundcube needs a database to store sessions, contacts, and settings.

### Solution ✅
Added PostgreSQL container with proper configuration in docker-compose.yml.

---

## Mail container keeps restarting

### Cause
SSL certificates were required but not present.

### Solution ✅
Set `SSL_TYPE=` (empty) in mail.env to disable SSL for local testing.

---

## Can't login to Roundcube

### Check 1: User exists
```bash
docker exec mail setup email list
```

### Check 2: Correct credentials
- Username: `alice@qumail.local` (full email address)
- Password: `password123`

### Check 3: Services running
```bash
docker ps
```
All three containers (mail, roundcube_db, roundcube) should be "Up".

### Check 4: Logs
```bash
docker compose logs roundcube | findstr error
docker compose logs mail | findstr error
```

---

## Port already in use

### Check what's using the port
```powershell
# PowerShell
netstat -ano | findstr :25
netstat -ano | findstr :8080
```

### Stop Windows SMTP service (if port 25 conflict)
```powershell
# Run as Administrator
Stop-Service -Name "SMTPSVC" -ErrorAction SilentlyContinue
```

### Change ports in docker-compose.yml
```yaml
ports:
  - "8081:80"  # Change 8080 to 8081
```

---

## Email not being delivered

### Check 1: Mail queue
```bash
docker exec mail postqueue -p
```

### Check 2: Mail logs
```bash
docker compose logs -f mail
```

### Check 3: Mailbox directory
```bash
docker exec mail ls -la /var/mail/qumail.local/alice/new/
```

### Check 4: Postfix status
```bash
docker exec mail postfix status
```

---

## Dovecot errors (fstat failed)

These are normal during initial setup. Dovecot creates missing directories automatically.

Example:
```
Error: Mailbox Trash: fstat(...) failed: No such file or directory
```

**Solution:** Just use the mailbox normally. Directories are created on first use.

---

## Container won't start after system reboot

### Restart all services
```bash
cd d:\Final project\source_code\qumail
docker compose down
docker compose up -d
```

### Check Docker Desktop is running
Ensure Docker Desktop is started before running compose commands.

---

## Database connection errors

### Check database is running
```bash
docker ps | findstr roundcube_db
```

### Check database logs
```bash
docker compose logs db
```

### Recreate database
```bash
docker compose down -v
docker compose up -d
```
**Warning:** This deletes all data!

---

## Performance issues

### Check resource usage
```bash
docker stats
```

### Increase Docker resources
Docker Desktop → Settings → Resources:
- Memory: 4GB minimum
- CPU: 2 cores minimum

---

## Reset everything

### Complete reset (deletes all data)
```bash
docker compose down -v
rmdir /s /q data
mkdir data\maildata data\mailstate data\maillogs data\dkim data\db
docker compose up -d
```

### Wait for initialization
```bash
# Wait 30 seconds
ping -n 30 127.0.0.1 >nul
```

### Recreate user
```bash
docker exec mail setup email add alice@qumail.local password123
```

---

## Getting help

### View all logs
```bash
docker compose logs -f
```

### View specific service logs
```bash
docker compose logs -f mail
docker compose logs -f roundcube
docker compose logs -f db
```

### Check container details
```bash
docker inspect mail
docker inspect roundcube
docker inspect roundcube_db
```

### Enter container for debugging
```bash
docker exec -it mail bash
docker exec -it roundcube bash
```
