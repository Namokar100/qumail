/**
 * QuMail PQC Crypto Module - Phase 3.3
 * 
 * REAL ML-KEM-768 (Kyber768) cryptographic operations for E2E encryption.
 * Uses @noble/post-quantum library - NIST FIPS 203 compliant.
 * 
 * This is REAL post-quantum cryptography - NOT a simulation!
 * 
 * ML-KEM-768 parameters:
 * - Public key: 1184 bytes
 * - Private key: 2400 bytes
 * - Ciphertext: 1088 bytes
 * - Shared secret: 32 bytes
 */

window.PQCCrypto = (function() {
    'use strict';

    // Constants for AES-GCM encryption
    const PBKDF2_ITERATIONS = 100000;
    const SALT_LENGTH = 16;
    const NONCE_LENGTH = 12;
    
    // ML-KEM-768 key sizes (from @noble/post-quantum)
    let KYBER_PUBLIC_KEY_SIZE = 1184;
    let KYBER_PRIVATE_KEY_SIZE = 2400;
    let KYBER_CIPHERTEXT_SIZE = 1088;
    let KYBER_SHARED_SECRET_SIZE = 32;

    // Check if ML-KEM library is loaded
    function getMlKem() {
        if (typeof window.ml_kem768 === 'undefined') {
            throw new Error('ML-KEM-768 library not loaded. Ensure noble-pqc.bundle.js is included.');
        }
        return window.ml_kem768;
    }

    /**
     * Generate random bytes
     */
    function getRandomBytes(length) {
        return crypto.getRandomValues(new Uint8Array(length));
    }

    /**
     * Convert ArrayBuffer to Base64 string
     */
    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Convert Base64 string to ArrayBuffer
     */
    function base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    /**
     * Generate a ML-KEM-768 (Kyber768) keypair
     * 
     * This generates REAL post-quantum keys using NIST FIPS 203 ML-KEM.
     * 
     * @returns {Promise<{publicKey: Uint8Array, privateKey: Uint8Array}>}
     */
    async function generateKeyPair() {
        const mlKem = getMlKem();
        
        console.log('[PQC Crypto] Generating REAL ML-KEM-768 keypair...');
        
        // Generate using @noble/post-quantum
        const { publicKey, secretKey } = mlKem.keygen();
        
        console.log('[PQC Crypto] ✅ Generated ML-KEM-768 keypair:');
        console.log(`  - Public key: ${publicKey.length} bytes`);
        console.log(`  - Private key: ${secretKey.length} bytes`);
        console.log(`  - Algorithm: ML-KEM-768 (NIST FIPS 203)`);
        
        // Update sizes from library
        KYBER_PUBLIC_KEY_SIZE = publicKey.length;
        KYBER_PRIVATE_KEY_SIZE = secretKey.length;
        
        return { 
            publicKey: new Uint8Array(publicKey), 
            privateKey: new Uint8Array(secretKey) 
        };
    }

    /**
     * Perform ML-KEM key encapsulation (KEM)
     * 
     * Creates a shared secret and ciphertext using REAL post-quantum crypto.
     * 
     * @param {Uint8Array} recipientPublicKey - Recipient's public key
     * @returns {Promise<{ciphertext: Uint8Array, sharedSecret: Uint8Array}>}
     */
    async function encapsulate(recipientPublicKey) {
        const mlKem = getMlKem();
        
        console.log('[PQC Crypto] Encapsulating with ML-KEM-768...');
        console.log(`  - Public key size: ${recipientPublicKey.length} bytes`);
        
        // Use @noble/post-quantum encapsulation
        const { cipherText, sharedSecret } = mlKem.encapsulate(recipientPublicKey);
        
        console.log('[PQC Crypto] ✅ Encapsulation complete:');
        console.log(`  - Ciphertext: ${cipherText.length} bytes`);
        console.log(`  - Shared secret: ${sharedSecret.length} bytes`);
        
        // Update size from library
        KYBER_CIPHERTEXT_SIZE = cipherText.length;

        return { 
            ciphertext: new Uint8Array(cipherText), 
            sharedSecret: new Uint8Array(sharedSecret) 
        };
    }

    /**
     * Perform ML-KEM key decapsulation (KEM)
     * 
     * Recovers the shared secret using REAL post-quantum crypto.
     * 
     * @param {Uint8Array} ciphertext - Ciphertext from encapsulation
     * @param {Uint8Array} privateKey - Recipient's private key
     * @returns {Promise<Uint8Array>} Shared secret (32 bytes)
     */
    async function decapsulate(ciphertext, privateKey) {
        const mlKem = getMlKem();
        
        console.log('[PQC Crypto] Decapsulating with ML-KEM-768...');
        console.log(`  - Ciphertext size: ${ciphertext.length} bytes`);
        console.log(`  - Private key size: ${privateKey.length} bytes`);
        
        // Use @noble/post-quantum decapsulation
        const sharedSecret = mlKem.decapsulate(ciphertext, privateKey);
        
        console.log('[PQC Crypto] ✅ Decapsulation complete:');
        console.log(`  - Shared secret: ${sharedSecret.length} bytes`);

        return new Uint8Array(sharedSecret);
    }

    /**
     * Derive an AES-256 key from passphrase using PBKDF2
     */
    async function deriveKeyFromPassphrase(passphrase, salt) {
        const encoder = new TextEncoder();
        const passphraseKey = await crypto.subtle.importKey(
            'raw',
            encoder.encode(passphrase),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            passphraseKey,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypt private key with passphrase using AES-256-GCM
     */
    async function encryptPrivateKey(privateKey, passphrase) {
        const salt = getRandomBytes(SALT_LENGTH);
        const nonce = getRandomBytes(NONCE_LENGTH);
        
        const key = await deriveKeyFromPassphrase(passphrase, salt);
        
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: nonce },
            key,
            privateKey
        );

        return {
            ciphertext: new Uint8Array(ciphertext),
            salt: salt,
            nonce: nonce
        };
    }

    /**
     * Decrypt private key with passphrase
     */
    async function decryptPrivateKey(ciphertext, salt, nonce, passphrase) {
        const key = await deriveKeyFromPassphrase(passphrase, salt);
        
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: nonce },
            key,
            ciphertext
        );

        return new Uint8Array(decrypted);
    }

    /**
     * Encrypt a message with a shared secret using AES-256-GCM
     */
    async function encryptMessage(message, sharedSecret) {
        const encoder = new TextEncoder();
        const nonce = getRandomBytes(NONCE_LENGTH);
        
        const key = await crypto.subtle.importKey(
            'raw',
            sharedSecret,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt']
        );

        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: nonce },
            key,
            encoder.encode(message)
        );

        return {
            ciphertext: new Uint8Array(ciphertext),
            nonce: nonce
        };
    }

    /**
     * Decrypt a message with a shared secret
     */
    async function decryptMessage(ciphertext, nonce, sharedSecret) {
        const decoder = new TextDecoder();
        
        const key = await crypto.subtle.importKey(
            'raw',
            sharedSecret,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: nonce },
            key,
            ciphertext
        );

        return decoder.decode(decrypted);
    }

    /**
     * Check if real PQC is available
     */
    function isRealPQCAvailable() {
        return typeof window.ml_kem768 !== 'undefined';
    }

    /**
     * Get algorithm info
     */
    function getAlgorithmInfo() {
        const available = isRealPQCAvailable();
        if (available) {
            const mlKem = getMlKem();
            return {
                name: 'ML-KEM-768',
                standard: 'NIST FIPS 203',
                type: mlKem.info?.type || 'ml-kem',
                quantumSafe: true,
                library: '@noble/post-quantum',
                publicKeySize: mlKem.lengths?.publicKey || KYBER_PUBLIC_KEY_SIZE,
                secretKeySize: mlKem.lengths?.secretKey || KYBER_PRIVATE_KEY_SIZE,
                ciphertextSize: mlKem.lengths?.cipherText || KYBER_CIPHERTEXT_SIZE,
                sharedSecretSize: KYBER_SHARED_SECRET_SIZE
            };
        }
        return {
            name: 'Not Available',
            quantumSafe: false,
            error: 'ML-KEM library not loaded'
        };
    }

    // Initialize on load
    setTimeout(() => {
        if (isRealPQCAvailable()) {
            console.log('[PQC Crypto] ✅ REAL ML-KEM-768 (Kyber768) available');
            console.log('[PQC Crypto] Algorithm info:', getAlgorithmInfo());
        } else {
            console.error('[PQC Crypto] ❌ ML-KEM library not loaded! Encryption will fail.');
        }
    }, 200);

    // Public API
    return {
        generateKeyPair,
        encapsulate,
        decapsulate,
        encryptPrivateKey,
        decryptPrivateKey,
        encryptMessage,
        decryptMessage,
        arrayBufferToBase64,
        base64ToArrayBuffer,
        isRealPQCAvailable,
        getAlgorithmInfo,
        KYBER_PUBLIC_KEY_SIZE,
        KYBER_PRIVATE_KEY_SIZE,
        KYBER_CIPHERTEXT_SIZE,
        KYBER_SHARED_SECRET_SIZE
    };
})();
