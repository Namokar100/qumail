---
trigger: always_on
---

# QuMail PQC Migration Knowledge Base

This document summarizes the **entire finalized plan** for the QuMail project, covering:

---

# 1. Project Overview

QuMail is a custom mail server architecture designed to:

1. Provide a fully functional email service (SMTP + IMAP + Webmail)
2. Support a custom domain in future (e.g., *qumail.com*)
3. Enable **Post-Quantum Cryptography (PQC)** at the transport layer
4. Optionally support **PQC-based End-to-End (E2E) encryption**
5. Demonstrate a practical, real-world migration path from classical crypto to PQC

The project is divided into two major phases:

### **Phase A — Base Mail System (Classical TLS)**

Using **docker-mailserver**, PostgreSQL, and Roundcube.

### **Phase B — PQC Migration Layer**

Adding a **PQC-enabled Reverse Proxy Gateway** in front of the existing stack.
This approach avoids modifying Postfix/Dovecot while still delivering quantum-safe TLS.

---

# 2. Final Architecture (High-Level)

```
Client → PQC Proxy → QuMail Server → Gmail/External Email
```

### Components:

* **QuMail Server** → Postfix + Dovecot (docker-mailserver)
* **Roundcube** → Webmail UI
* **PQC Proxy Gateway** → NGINX with Open Quantum Safe (OQS) OpenSSL
* **Test Clients** → PQC-enabled curl / oqs-openssl

The PQC Proxy provides **PQC TLS termination** while the backend server remains unchanged.

This is the exact strategy used by:

* Cloudflare (PQC-ready TLS 1.3 terminators)
* Google PQC experiments
* Enterprise "TLS Offloading" architectures

---

# 3. Base Mail Server Setup (Classical TLS)

This is the foundation before adding PQC.

### Components:

* **docker-mailserver:15.1.0** → SMTP, IMAP, Dovecot, Postfix
* **PostgreSQL 15** → Roundcube DB
* **Roundcube** → Webmail frontend

### Key Features:

* Supports local domain `qumail.local` (dev mode)
* Supports future custom domain (e.g., `qumail.com`)
* Supports DKIM, SPF, DMARC (in future)
* Uses **manual TLS certificates** for local development

### Required Directory Structure:

```
./data/maildata
./data/mailstate
./data/maillogs
./data/dkim
./data/db
./data/ssl
./config
```

Directory creation and TLS generation are automated via `setup-mail-folders.sh`.

---

# 4. PQC Migration Strategy

Directly modifying Postfix or Dovecot for PQC is **not feasible** because:

* They are compiled against Debian OpenSSL
* PQC-enabled OpenSSL (OQS-OpenSSL) is not drop-in compatible
* Rebuilding docker-mailserver from source is extremely complex

Therefore, we adopt a **PQC Proxy Gateway** solution.

This provides PQC without touching the existing mail server.

### Why it works:

* PQC TLS termination happens at the proxy
* Mailserver continues using classical TLS internally
* External mail providers (Gmail, Outlook) still communicate normally

### Benefits:

* Very low risk
* Easy to implement
* Demonstrable PQC upgrade
* No breakage of existing protocols
* Future-proof (supports hybrid TLS)

---

# 5. PQC Proxy Gateway (NGINX + OQS)

This is the centerpiece of the migration.

### Proxy Responsibilities:

* Accept PQC TLS connections on new ports
* Terminate PQC handshake (Kyber768, Dilithium signatures)
* Forward decrypted traffic to classical mail server
* Provide PQC HTTPS for Roundcube webmail

### Proxy Ports:

```
1025  → PQC SMTP
1143  → PQC IMAP
1443  → PQC HTTPS for Roundcube
```

### Internal Routing:

```
PQC SMTP → mail:25
PQC IMAP → mail:143
PQC HTTPS → roundcube:80
```

### Cipher Suites:

* Kyber768
* Dilithium3
* Hybrid (X25519 + Kyber768)

These configurations live in:

```
config/nginx/nginx.conf
```

---

# 6. E2E PQC Encryption (Optional Feature)

E2E PQC encryption is **separate from TLS**.
It encrypts the email content itself.

### How this works:

1. Sender encrypts message using Kyber (WASM/liboqs)
2. Sends ciphertext via SMTP (QuMail or Gmail — both okay)
3. Receiver decrypts using their Kyber private key

### Gmail support:

Gmail does **not** support PQC natively.
But email is just text → PQC ciphertext can be sent through Gmail.

### QuMail support:

You can add a **Roundcube PQC Plugin**:

* Key generation in browser
* Encrypt before sending
* Decrypt after receiving

---

# 7. Mail Flow & PQC Compatibility

### External Email (Gmail, Outlook, Yahoo)

Uses *normal TLS*.
Your PQC proxy does **not** affect this.

### Controlled Clients (Your PQC test clients)

Use **PQC TLS** by connecting to your proxy.

### Both systems work simultaneously.

This makes the whole setup backward compatible.

---

# 8. Viva-Ready Explanations

### **Why PQC Proxy Instead of Modifying Mailserver?**

Because modifying Postfix/Dovecot to support PQC requires recompiling core dependencies with an experimental TLS stack. A proxy architecture isolates PQC at the network boundary, which matches what large-scale providers are doing.

### **Does Gmail support PQC?**

Not yet. But PQC encryption still works because ciphertext can be sent through any email provider.

### **How do you prove PQC is used?**

Using:

```
oqs-openssl s_client -connect localhost:1443
```

This prints the PQC algorithms used.

### **Can QuMail use a real domain?**

Yes. Simply configure DNS:

* A record
* MX record
* SPF/DKIM/DMARC
  It works like Gmail.

---

# 9. Implementation Roadmap

### **Phase 1 — Base Mail Server**

* Set up docker-mailserver
* Set up Roundcube + Postgres
* Verify SMTP/IMAP/HTTPS

### **Phase 2 — PQC Migration**

* Add PQC Proxy (OQS-NGINX)
* Configure PQC TLS
* Route SMTP/IMAP/HTTPS through proxy
* Test PQC handshake

### **Phase 3 — PQC E2E Encryption (Optional)**

* Implement browser-based Kyber encryption
* Add Roundcube plugin
* Add CLI encryption demo

---

# 10. What This System Achieves

* Full-featured email system
* Ready to use with custom domain
* PQC TLS for controlled clients
* Backward compatibility with Gmail
* Demonstrable migration strategy
* Optional PQC E2E security
* Fully containerized architecture

This is more than sufficient for a **major project**, and is comparable to real quantum-resistant deployments.

---

# 11. Reference Diagram (ASCII)

```
           PQC Client
        (Hybrid TLS 1.3)
                |
                v
        +----------------+
        |  PQC PROXY     |
        |  (NGINX + OQS) |
        +----------------+
                |
                | Classical TLS
                v
     +------------------------+
     | QuMail Mail Server     |
     | Postfix + Dovecot      |
     +------------------------+
                |
                | SMTP Federation
                v
     +------------------------+
     | External Mail Servers  |
     | (Gmail, Outlook, etc.) |
     +------------------------+
```

---

# 12. Final Notes for Developers / The Coding Agent

* **docker-mailserver must NOT be modified** for PQC.
* All PQC features live in the **PQC proxy**, separate from mail logic.
* QuMail remains a standard SMTP/IMAP server.
* PQC E2E is optional and can be developed independently.
* This architecture is safe, modular, modern, and realistic.

---

# End of QuMail PQC Migration Knowledge Base

This file can now be referenced whenever memory is lost or context needs to be restored.
