# QuMail Phase 2: Detailed Q&A

This document provides in-depth answers to specific questions about the Phase 2 PQC implementation.

- **Author:** Namokar R Savaganve 
- **Audience:** Developers, Academic Reviewers 
- **Status:** Implementation Complete 

---

## 1. What is OQS, OQS curl?

### OQS (Open Quantum Safe)

**OQS** is an **open-source project** that provides:
1. **liboqs** — A C library implementing quantum-safe cryptographic algorithms
2. **OQS-OpenSSL** — A fork of OpenSSL 3.x integrated with liboqs
3. **Pre-built Docker images** — Ready-to-use containers with PQC support

```
┌─────────────────────────────────────────────────────────────┐
│                    Open Quantum Safe Project                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │   liboqs      │  │  OQS-OpenSSL   │  │  OQS-Provider  │ │
│  │   (C library) │  │  (TLS stack)   │  │  (OpenSSL 3.x) │ │
│  └───────┬───────┘  └────────┬───────┘  └────────┬───────┘ │
│          │                   │                   │         │
│          └───────────────────┼───────────────────┘         │
│                              │                             │
│                              ▼                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │             Docker Images Available:                │   │
│  │  • openquantumsafe/nginx   (PQC-enabled Nginx)     │   │
│  │  • openquantumsafe/curl    (PQC-enabled curl)      │   │
│  │  • openquantumsafe/openssh (PQC-enabled SSH)       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Website:** https://openquantumsafe.org/

### OQS curl

**OQS curl** is a Docker image containing:
- Standard `curl` command-line tool
- Compiled against OQS-OpenSSL instead of system OpenSSL
- Can negotiate PQC TLS handshakes

**Why we use it:**
- Normal curl (on Windows/Linux/Mac) does NOT support PQC
- OQS curl does → we use it to **test** our PQC proxy

**Your test command explained:**
```bash
docker run -it openquantumsafe/curl curl -k https://host.docker.internal:1443
```

| Part | Meaning |
|------|---------|
| `docker run -it` | Run container interactively |
| `openquantumsafe/curl` | The OQS curl Docker image |
| `curl -k` | Make HTTPS request, skip certificate verification |
| `https://host.docker.internal:1443` | Connect to your PQC proxy |

**Result:** The HTML output you saw was the Roundcube login page fetched over PQC TLS!

### OQS OpenSSL s_client

The second command you ran:
```bash
docker run -it openquantumsafe/curl openssl s_client -connect host.docker.internal:1443
```

This uses `openssl s_client` (a TLS debugging tool) to show the **raw TLS handshake details**:

From your output:
```
Certificate chain
 0 s:CN=pqc-proxy
   i:CN=pqc-proxy
   a:PKEY: rsaEncryption, 2048 (bit); sigalg: RSA-SHA256
```

This confirms:
- ✅ Connection succeeded
- ✅ Certificate is self-signed (`CN=pqc-proxy`)
- ✅ RSA-2048 key with SHA256 signature (classical authentication)

---

## 2. What is TLS Termination?

### The Concept

**TLS Termination** is when an intermediary (like a reverse proxy) **decrypts** the incoming TLS connection instead of the final destination server.

### Without TLS Termination (Direct Connection)

```
┌──────────┐                              ┌──────────────────┐
│  Client  │════════ TLS Encrypted ═══════│  Roundcube       │
│          │                              │  (handles TLS)   │
└──────────┘                              └──────────────────┘

• Roundcube must have TLS certificates
• Roundcube must handle TLS handshakes
• Roundcube must support PQC (it doesn't!)
```

### With TLS Termination (Proxy Pattern)

```
┌──────────┐        TLS Encrypted        ┌─────────────────┐
│  Client  │═════════════════════════════│   PQC Proxy     │
│          │        (PQC Kyber)          │   (Nginx)       │
└──────────┘                             └────────┬────────┘
                                                  │
                                         Plain HTTP (decrypted)
                                                  │
                                                  ▼
                                         ┌─────────────────┐
                                         │   Roundcube     │
                                         │   (no TLS)      │
                                         └─────────────────┘

• Nginx handles all TLS (including PQC)
• Roundcube receives plain HTTP
• Backend services don't need PQC support
```

### Why TLS Termination Matters for QuMail

| Benefit | Explanation |
|---------|-------------|
| **Enables PQC without modifying mail server** | Postfix/Dovecot/Roundcube don't need changes |
| **Centralized certificate management** | One place to update certificates |
| **Performance optimization** | Proxy can cache, load balance, etc. |
| **Security boundary** | Internal network is isolated |

### Is Internal Traffic Secure?

**In Docker:** Yes, because:
1. Docker bridge network is isolated
2. Only containers can communicate internally
3. No external access to internal ports

**In Production:** You would add:
- Internal TLS between proxy and backend
- Network segmentation
- Firewall rules

---

## 3. How Does Authentication Happen? Can We Use PQC?

### TLS Authentication Overview

TLS has **two security goals**:
1. **Confidentiality** (encryption) — No one can read the data
2. **Authentication** — Prove the server is who it claims to be

### How Authentication Works Today

```
┌─────────────────────────────────────────────────────────────────┐
│                    TLS Authentication Flow                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Client                              Server                     │
│     │                                   │                       │
│     │──── ClientHello ─────────────────→│                       │
│     │                                   │                       │
│     │←─── ServerHello + Certificate ────│                       │
│     │     (Contains public key +        │                       │
│     │      CA signature)                │                       │
│     │                                   │                       │
│     │  Client verifies:                 │                       │
│     │  1. Certificate signed by         │                       │
│     │     trusted CA?                   │                       │
│     │  2. Certificate matches           │                       │
│     │     domain name?                  │                       │
│     │  3. Certificate not expired?      │                       │
│     │                                   │                       │
│     │  If ALL checks pass:              │                       │
│     │  → Server is authenticated!       │                       │
│     │                                   │                       │
└─────────────────────────────────────────────────────────────────┘
```

### The Signature Chain

```
┌───────────────────────────────────────────────────────────────┐
│  Root CA Certificate (Pre-installed in your browser/OS)       │
│  [Self-signed, RSA-4096]                                      │
└───────────────────────────┬───────────────────────────────────┘
                            │ Signs
                            ▼
┌───────────────────────────────────────────────────────────────┐
│  Intermediate CA Certificate                                  │
│  [Signed by Root CA, RSA-2048]                                │
└───────────────────────────┬───────────────────────────────────┘
                            │ Signs
                            ▼
┌───────────────────────────────────────────────────────────────┐
│  Server Certificate (pqc_cert.pem)                            │
│  [Signed by Intermediate CA, RSA-2048]                        │
│  Contains: Server's public key + Domain name + Validity       │
└───────────────────────────────────────────────────────────────┘
```

### Can We Use PQC for Authentication?

**Theoretically Yes, Practically Not Yet.**

| Requirement | Status |
|-------------|--------|
| PQC signature algorithms exist (Dilithium, Falcon) | ✅ |
| NIST has standardized them (FIPS 204, 205) | ✅ |
| Certificate Authorities issue PQC certificates | ❌ No |
| Browsers validate PQC signatures | ❌ No |
| Email clients support PQC certificates | ❌ No |

### The Hybrid Solution (Current Best Practice)

```
┌─────────────────────────────────────────────────────────────────┐
│                   QuMail Phase 2 Approach                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────┐  ┌──────────────────────────────┐ │
│  │    Key Exchange         │  │    Authentication            │ │
│  │    (Confidentiality)    │  │    (Identity Proof)          │ │
│  │                         │  │                              │ │
│  │  ✅ POST-QUANTUM        │  │  ❌ CLASSICAL (RSA/ECDSA)    │ │
│  │  • Kyber768 KEM         │  │  • RSA-2048 certificate      │ │
│  │  • Quantum-safe         │  │  • Signed by CA              │ │
│  │                         │  │                              │ │
│  └─────────────────────────┘  └──────────────────────────────┘ │
│                                                                 │
│  Why this is acceptable:                                        │
│  • Key exchange is what attackers can "harvest" for later       │
│  • Authentication happens in real-time (can't harvest)          │
│  • Quantum computers need to be active NOW to forge signatures  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### When Will Full PQC Authentication Be Possible?

| Timeline | Expected Development |
|----------|---------------------|
| 2024-2025 | Experimental PQC certificates in test environments |
| 2025-2027 | Major CAs begin issuing hybrid (classical+PQC) certificates |
| 2027-2030 | Browser and OS support for PQC certificate validation |
| 2030+ | Widespread PQC PKI adoption |

---

## 4. Encapsulated Secret vs Encrypted Data vs E2E

### Summary Table

| Term | What It Is | When It Happens | Scope |
|------|-----------|-----------------|-------|
| **Encapsulated Secret** | Kyber's output during key exchange | TLS handshake | Session key creation |
| **Encrypted Application Data** | Your actual email/webpage content | After handshake | Client ↔ Server |
| **E2E Encryption** | Content encrypted before leaving sender | Before sending | Sender ↔ Recipient |

### 1. Encapsulated Secret (Kyber KEM)

**What is a KEM?**
KEM = Key Encapsulation Mechanism

Unlike Diffie-Hellman (where both sides contribute), Kyber works like a "lockbox":

```
┌─────────────────────────────────────────────────────────────────┐
│                        Kyber KEM Process                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Server generates:                                             │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │  Kyber Key Pair:                                         │ │
│   │  • Public Key (1184 bytes) → Sent to client              │ │
│   │  • Private Key (2400 bytes) → Kept secret                │ │
│   └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│   Client receives public key:                                   │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │  Encapsulation:                                          │ │
│   │  Input: Server's Public Key                              │ │
│   │  Output:                                                 │ │
│   │    1. Shared Secret (32 bytes) - Client keeps this       │ │
│   │    2. Ciphertext (1088 bytes) - Sent to server           │ │
│   │                      ↑                                   │ │
│   │              "Encapsulated Secret"                       │ │
│   └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│   Server decapsulates:                                          │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │  Decapsulation:                                          │ │
│   │  Input: Ciphertext + Private Key                         │ │
│   │  Output: Same Shared Secret (32 bytes)                   │ │
│   │                                                          │ │
│   │  Both sides now have identical shared secret!            │ │
│   └──────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key Point:** The "encapsulated secret" is the ciphertext sent from client to server. Only the server can decrypt it.

### 2. Encrypted Application Data

After the handshake, both sides have a **shared secret**. This is used to derive **symmetric keys** (AES-256):

```
┌─────────────────────────────────────────────────────────────────┐
│               After TLS Handshake Completes                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Shared Secret (from Kyber) ──────┐                             │
│                                   │                             │
│                                   ▼                             │
│                    ┌──────────────────────────┐                 │
│                    │  Key Derivation Function │                 │
│                    │  (HKDF)                  │                 │
│                    └────────────┬─────────────┘                 │
│                                 │                               │
│            ┌────────────────────┼────────────────────┐          │
│            │                    │                    │          │
│            ▼                    ▼                    ▼          │
│     ┌───────────┐        ┌───────────┐        ┌───────────┐    │
│     │ Client    │        │ Server    │        │ IV/Nonce  │    │
│     │ Write Key │        │ Write Key │        │           │    │
│     │ (AES-256) │        │ (AES-256) │        │           │    │
│     └───────────┘        └───────────┘        └───────────┘    │
│                                                                 │
│  Now every message is encrypted:                                │
│                                                                 │
│  Client: "GET /webmail" ──→ [AES-256 Encrypt] ──→ Ciphertext   │
│                                                                 │
│  Server: [HTML page] ──────→ [AES-256 Encrypt] ──→ Ciphertext  │
│                                                                 │
│  This is "Encrypted Application Data"                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3. End-to-End Encryption (E2E)

E2E is **completely different** from TLS:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Transport Encryption (TLS)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Sender                    Server                    Recipient  │
│    │                         │                          │       │
│    │══ TLS Encrypted ═══════▶│                          │       │
│    │                         │ [READABLE BY SERVER]     │       │
│    │                         │ Server can log,          │       │
│    │                         │ scan, modify             │       │
│    │                         │══ TLS Encrypted ════════▶│       │
│    │                         │                          │       │
│                                                                 │
│  ❌ Server sees plaintext content                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   End-to-End Encryption (E2E)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Sender                    Server                    Recipient  │
│    │                         │                          │       │
│    │ [Encrypt with           │                          │       │
│    │  Recipient's            │                          │       │
│    │  Public Key]            │                          │       │
│    │                         │                          │       │
│    │══ Ciphertext ══════════▶│══ Ciphertext ═══════════▶│       │
│    │                         │ [CANNOT READ!]           │       │
│    │                         │                          │       │
│    │                         │                [Decrypt  │       │
│    │                         │                 with     │       │
│    │                         │                 Private  │       │
│    │                         │                 Key]     │       │
│                                                                 │
│  ✅ Only recipient can read content                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### QuMail Phase 2 vs E2E

| Aspect | Phase 2 (TLS) | E2E (Future Phase 3) |
|--------|---------------|---------------------|
| What's encrypted | Connection to server | Email content itself |
| Who can read | Server can read | Only recipient |
| Where encryption happens | In transit | Before sending |
| Implementation | Nginx proxy | Roundcube plugin + PQC libraries |

---

## 5. How Does QuMail Communicate with Gmail/Outlook?

### Understanding Email Federation

Email is **federated** — different servers communicate using standard protocols:

```
You send email to: friend@gmail.com

┌─────────────────────────────────────────────────────────────────┐
│                      Email Delivery Flow                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. You compose email in Roundcube (QuMail Webmail)             │
│                                                                 │
│  2. Roundcube sends to Postfix (QuMail SMTP server)             │
│     ┌──────────────┐      ┌────────────────┐                   │
│     │  Roundcube   │─────→│    Postfix     │                   │
│     │  (Webmail)   │      │    Port 587    │                   │
│     └──────────────┘      └───────┬────────┘                   │
│                                   │                             │
│  3. Postfix looks up Gmail's mail server (MX record)            │
│     DNS Query: "Where is gmail.com's mail server?"              │
│     Answer: aspmx.l.google.com                                  │
│                                   │                             │
│  4. Postfix connects to Gmail's SMTP server                     │
│     ┌────────────────┐      ┌────────────────────────────────┐ │
│     │    Postfix     │═════→│   Gmail SMTP                   │ │
│     │    Port 25     │      │   aspmx.l.google.com:25        │ │
│     └────────────────┘      └────────────────────────────────┘ │
│                                                                 │
│     This connection uses: STARTTLS (Classical TLS)              │
│     Handshake: ECDHE key exchange, RSA/ECDSA auth               │
│     Cipher: TLS 1.3 with AES-256-GCM                            │
│                                                                 │
│  5. Gmail accepts the email and delivers to recipient           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Which Handshake Happens?

**QuMail ↔ Gmail/Outlook:** **Classical TLS Only**

```
┌─────────────────────────────────────────────────────────────────┐
│              SMTP Handshake: QuMail → Gmail                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  QuMail Postfix                           Gmail SMTP            │
│       │                                        │                │
│       │──────── EHLO qumail.local ────────────→│                │
│       │                                        │                │
│       │←─────── 250-STARTTLS ─────────────────│                │
│       │         (Gmail says: "I support TLS")  │                │
│       │                                        │                │
│       │──────── STARTTLS ─────────────────────→│                │
│       │         (QuMail says: "Let's encrypt") │                │
│       │                                        │                │
│       │←══════ TLS Handshake (Classical) ═════│                │
│       │         • ECDHE-RSA key exchange       │                │
│       │         • RSA-2048 certificate         │                │
│       │         • AES-256-GCM encryption       │                │
│       │                                        │                │
│       │──────── MAIL FROM: <you@qumail.local> │                │
│       │──────── RCPT TO: <friend@gmail.com> ──→│                │
│       │──────── DATA + Email content ─────────→│                │
│       │                                        │                │
│       │←─────── 250 OK ───────────────────────│                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why Not PQC with Gmail?

| Reason | Explanation |
|--------|-------------|
| Gmail doesn't support PQC SMTP | They haven't upgraded their mail servers yet |
| SMTP protocol negotiation | Both sides must advertise PQC-capable ciphers |
| No standardization yet | IETF hasn't standardized PQC for SMTP |

### How Do They Identify Each Other?

**Server Identification:** Certificates

```
QuMail Postfix checks:
1. Does Gmail's certificate match "*.google.com"?
2. Is it signed by a trusted CA (DigiCert, etc.)?
3. Is it not expired?

Gmail checks (for QuMail):
1. Does SPF record allow QuMail's IP?
2. Is DKIM signature valid?
3. Does DMARC policy pass?
```

### Compatibility Summary

| Connection Type | Protocol | Key Exchange | Auth | PQC? |
|-----------------|----------|--------------|------|------|
| PQC Client → QuMail (1443) | HTTPS | Kyber768 | RSA Cert | ✅ Yes |
| Roundcube → QuMail (587) | SMTP | ECDHE | Password | ❌ No |
| QuMail → Gmail (25) | SMTP | ECDHE | Certificate | ❌ No |
| Gmail → QuMail (25) | SMTP | ECDHE | SPF/DKIM | ❌ No |
| Outlook → QuMail (25) | SMTP | ECDHE | SPF/DKIM | ❌ No |

---

## 6. Quantum Attacks on Authentication — Explained

### The Statement

> "Certificates are classical. A quantum computer could forge signatures, but this requires active attack (harder than passive)."

### Breaking This Down

**Two Types of Quantum Attacks:**

| Attack Type | Description | Difficulty | Can Be Recorded? |
|-------------|-------------|------------|-----------------|
| **Passive** | Record traffic, decrypt later | Easy | ✅ Yes ("Harvest Now") |
| **Active** | Intercept and modify traffic in real-time | Hard | ❌ No |

### Passive Attack (What Phase 2 Protects Against)

```
┌─────────────────────────────────────────────────────────────────┐
│                   "Harvest Now, Decrypt Later"                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TODAY (Attacker doesn't have quantum computer):                │
│                                                                 │
│  ┌─────────┐       ┌─────────┐       ┌─────────┐               │
│  │  Client │══════▶│ Network │══════▶│ Server  │               │
│  └─────────┘       └────┬────┘       └─────────┘               │
│                         │                                       │
│                    ┌────▼────┐                                  │
│                    │Attacker │──→ Saves encrypted               │
│                    │(Passive)│    packets to disk               │
│                    └─────────┘                                  │
│                                                                 │
│  FUTURE (Attacker has quantum computer):                        │
│                                                                 │
│  ┌─────────────┐      ┌──────────────────────────┐             │
│  │ Saved       │─────▶│ Quantum Computer         │             │
│  │ Packets     │      │ Runs Shor's Algorithm    │             │
│  └─────────────┘      │ Breaks ECDHE key exchange│             │
│                       └──────────────┬───────────┘             │
│                                      ▼                          │
│                           ┌───────────────────┐                 │
│                           │   Decrypted!      │                 │
│                           │   All your emails │                 │
│                           └───────────────────┘                 │
│                                                                 │
│  ✅ PHASE 2 FIXES THIS: Kyber key exchange can't be broken     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Active Attack (What Phase 2 Does NOT Fully Protect Against)

```
┌─────────────────────────────────────────────────────────────────┐
│                      Active MITM Attack                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FUTURE (Attacker has quantum computer AND network access):     │
│                                                                 │
│  ┌─────────┐       ┌───────────────┐       ┌─────────┐         │
│  │  Client │══════▶│   Attacker    │══════▶│ Server  │         │
│  └─────────┘       │  (Active MITM)│       └─────────┘         │
│                    └───────┬───────┘                            │
│                            │                                    │
│  Attacker intercepts handshake:                                 │
│  1. Client sends ClientHello                                    │
│  2. Attacker intercepts, starts new handshake with server       │
│  3. Server sends Certificate (RSA-2048 signature)               │
│  4. Attacker uses quantum computer to:                          │
│     - Derive server's private key from certificate              │
│     - Create FAKE certificate with forged signature             │
│  5. Attacker sends fake certificate to client                   │
│  6. Client thinks they're talking to server!                    │
│                                                                 │
│  ⚠️ PHASE 2 VULNERABILITY: RSA/ECDSA signatures can be forged  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why Active is MUCH Harder Than Passive

| Factor | Passive Attack | Active Attack |
|--------|---------------|---------------|
| **Timing** | Record now, break decades later | Must break in milliseconds during handshake |
| **Network Position** | Anywhere on the path | Must be directly "in the middle" |
| **Detection Risk** | Undetectable | Latency anomalies, certificate changes |
| **Quantum Requirements** | Can wait for fast quantum computers | Needs FAST quantum computer NOW |
| **Target Scope** | All recorded traffic | Only current connections |

### Risk Assessment

```
┌─────────────────────────────────────────────────────────────────┐
│                    Risk Timeline Assessment                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  2024-2030: Quantum computers NOT capable enough                │
│  ────────────────────────────────────────────────               │
│  • Neither passive nor active attacks possible                  │
│  • Phase 2 provides FUTURE-PROOF protection for data            │
│                                                                 │
│  2030-2040: Early cryptographically-relevant quantum computers  │
│  ────────────────────────────────────────────────               │
│  • Passive attack on OLD (pre-Phase 2) traffic possible         │
│  • Active attack still extremely difficult                      │
│  • Phase 2 traffic remains safe                                 │
│                                                                 │
│  2040+: Mature quantum computers                                │
│  ────────────────────────────────────────────────               │
│  • Active attacks become theoretical possibility                │
│  • By then: Full PQC PKI should be deployed                     │
│  • QuMail would upgrade to PQC certificates                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Bottom Line

| Protection | Phase 2 Status |
|------------|---------------|
| Passive eavesdropping (future decrypt) | ✅ **Fully Protected** |
| Active MITM (real-time forgery) | ⚠️ **Partially Protected** (requires future quantum computer in real-time) |

The practical risk of active quantum attack is **extremely low** for the next 10-15 years.

---

## 7. SMTP/IMAP PQC Proxying — Why Not Enabled?

### Current Status

In `nginx.conf`, the stream block is **commented out**:

```nginx
# stream {
#     # PQC SMTP Proxy
#     server {
#         listen 1025 ssl;
#         proxy_pass mail:25;
#         ssl_certificate     /etc/nginx/ssl/pqc_cert.pem;
#         ssl_certificate_key /etc/nginx/ssl/pqc_key.pem;
#         ssl_ecdh_curve      kyber768:p521_kyber1024;
#     }
#
#     # PQC IMAP Proxy
#     server {
#         listen 1143 ssl;
#         proxy_pass mail:143;
#         ssl_certificate     /etc/nginx/ssl/pqc_cert.pem;
#         ssl_certificate_key /etc/nginx/ssl/pqc_key.pem;
#         ssl_ecdh_curve      kyber768;
#     }
# }
```

### Why Not Enabled?

| Reason | Explanation |
|--------|-------------|
| **HTTPS demonstrates the concept** | Proving PQC works with HTTPS is sufficient for Phase 2 |
| **Stream proxying is more complex** | Requires handling SMTP/IMAP protocol quirks |
| **No standard PQC mail clients** | Thunderbird, Outlook don't support PQC for IMAP/SMTP |
| **Testing complexity** | Harder to test than HTTPS with curl |
| **Priority focus** | HTTPS/Webmail is the primary user interface |

### What Happens When Enabled?

**After uncommenting:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Enabled SMTP/IMAP Proxy                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PQC Client (Thunderbird with PQC patches, or custom client)    │
│       │                                                         │
│       │ Connect to: mail.qumail.local:1025 (SMTP)              │
│       │         or: mail.qumail.local:1143 (IMAP)              │
│       │                                                         │
│       │══════════════════════════════════════════════════       │
│       │    TLS Handshake with Kyber768 Key Exchange            │
│       │══════════════════════════════════════════════════       │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     PQC Proxy                            │   │
│  │  • Terminates PQC TLS                                    │   │
│  │  • Decrypts SMTP/IMAP commands                          │   │
│  │  • Forwards to internal mail server                      │   │
│  └────────────────────────────┬────────────────────────────┘   │
│                               │                                 │
│                    Plain SMTP/IMAP                              │
│                               │                                 │
│                               ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Postfix/Dovecot                        │   │
│  │  • Processes email normally                              │   │
│  │  • No PQC changes needed                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### How to Enable It

**Step 1:** Edit `nginx.conf`

Uncomment the `stream` block:

```nginx
stream {
    # PQC SMTP Proxy
    server {
        listen 1025 ssl;
        proxy_pass mail:25;
        
        ssl_certificate     /etc/nginx/ssl/pqc_cert.pem;
        ssl_certificate_key /etc/nginx/ssl/pqc_key.pem;
        ssl_ecdh_curve      kyber768:p521_kyber1024;
    }

    # PQC IMAP Proxy
    server {
        listen 1143 ssl;
        proxy_pass mail:143;
        
        ssl_certificate     /etc/nginx/ssl/pqc_cert.pem;
        ssl_certificate_key /etc/nginx/ssl/pqc_key.pem;
        ssl_ecdh_curve      kyber768;
    }
}
```

**Step 2:** Restart the PQC proxy container

```bash
docker compose restart pqc-proxy
```

**Step 3:** Verify ports are listening

```bash
docker exec pqc_proxy netstat -tlnp
# Should show ports 443, 1025, 1143
```

### How to Test It

**Test SMTP Proxy (Port 1025):**

```bash
# Using OQS OpenSSL
docker run -it openquantumsafe/curl \
  openssl s_client -connect host.docker.internal:1025

# Expected: TLS handshake with PQC, then SMTP banner:
# 220 mail.qumail.local ESMTP
```

**Test IMAP Proxy (Port 1143):**

```bash
# Using OQS OpenSSL
docker run -it openquantumsafe/curl \
  openssl s_client -connect host.docker.internal:1143

# Expected: TLS handshake with PQC, then IMAP banner:
# * OK [CAPABILITY IMAP4rev1 ...] Dovecot ready.
```

**Send Email via PQC SMTP (Advanced):**

```bash
docker run -it openquantumsafe/curl bash

# Inside container:
openssl s_client -connect host.docker.internal:1025 << 'EOF'
EHLO test.local
AUTH PLAIN dXNlckBxdW1haWwubG9jYWwAdXNlckBxdW1haWwubG9jYWwAcGFzc3dvcmQxMjM=
MAIL FROM:<user@qumail.local>
RCPT TO:<user@qumail.local>
DATA
Subject: PQC Test

This email was sent through PQC SMTP proxy!
.
QUIT
EOF
```

> [!NOTE]
> The AUTH PLAIN string is base64 of `user@qumail.local\0user@qumail.local\0password123`

### What Changes After Enabling?

| Aspect | Before | After |
|--------|--------|-------|
| PQC SMTP | ❌ Not available | ✅ Port 1025 |
| PQC IMAP | ❌ Not available | ✅ Port 1143 |
| Classical ports | Still work | Still work |
| Gmail compatibility | Works | Unchanged |
| Thunderbird (standard) | Classical only | Classical only |
| Custom PQC client | Can't use | Can use PQC |

---

## Summary

| Question | Key Takeaway |
|----------|--------------|
| What is OQS? | Open-source PQC library + Docker images |
| What is TLS Termination? | Proxy decrypts TLS, backend gets plain traffic |
| PQC for Authentication? | Not yet practical — CAs don't issue PQC certs |
| Encapsulated vs E2E? | Different layers — TLS (transport) vs E2E (content) |
| QuMail ↔ Gmail? | Classical TLS only — Gmail doesn't support PQC |
| Quantum Auth Attacks? | Requires active MITM — much harder than passive |
| SMTP/IMAP PQC Proxy? | Ready to enable — just uncomment and restart |

---

*Created: December 30, 2025*
