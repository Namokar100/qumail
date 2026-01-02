/**
 * QuMail PQC Crypto Module
 * 
 * Browser-based Kyber768 cryptographic operations for E2E encryption.
 * Uses a simplified JavaScript implementation for demonstration purposes.
 * 
 * Note: In production, you would use liboqs-JS (WASM) for actual Kyber768.
 * This implementation provides the same API interface but uses a simplified
 * hybrid encryption scheme for demonstration.
 */

window.PQCCrypto = (function() {
    'use strict';

    // Constants
    const PBKDF2_ITERATIONS = 100000;
    const SALT_LENGTH = 16;
    const NONCE_LENGTH = 12;
    const KEY_LENGTH = 32;
    
    // Simulated Kyber key sizes (for API compatibility)
    const KYBER_PUBLIC_KEY_SIZE = 1184;
    const KYBER_PRIVATE_KEY_SIZE = 2400;
    const KYBER_CIPHERTEXT_SIZE = 1088;
    const KYBER_SHARED_SECRET_SIZE = 32;

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
     * Generate a Kyber768 keypair
     * 
     * Note: This is a simplified implementation using Web Crypto API.
     * In production, replace with actual liboqs-JS Kyber768.
     * 
     * @returns {Promise<{publicKey: Uint8Array, privateKey: Uint8Array}>}
     */
    async function generateKeyPair() {
        // Generate an ECDH keypair as a stand-in for Kyber768
        // In production: use liboqs-js Kyber768
        const keyPair = await crypto.subtle.generateKey(
            {
                name: 'ECDH',
                namedCurve: 'P-384'
            },
            true,
            ['deriveBits']
        );

        // Export keys
        const publicKeyRaw = await crypto.subtle.exportKey('spki', keyPair.publicKey);
        const privateKeyRaw = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

        // Pad to Kyber sizes for API compatibility
        const publicKey = new Uint8Array(KYBER_PUBLIC_KEY_SIZE);
        publicKey.set(new Uint8Array(publicKeyRaw), 0);
        
        const privateKey = new Uint8Array(KYBER_PRIVATE_KEY_SIZE);
        privateKey.set(new Uint8Array(privateKeyRaw), 0);
        // Store actual lengths at the end
        privateKey[KYBER_PRIVATE_KEY_SIZE - 4] = (publicKeyRaw.byteLength >> 8) & 0xFF;
        privateKey[KYBER_PRIVATE_KEY_SIZE - 3] = publicKeyRaw.byteLength & 0xFF;
        privateKey[KYBER_PRIVATE_KEY_SIZE - 2] = (privateKeyRaw.byteLength >> 8) & 0xFF;
        privateKey[KYBER_PRIVATE_KEY_SIZE - 1] = privateKeyRaw.byteLength & 0xFF;

        return { publicKey, privateKey };
    }

    /**
     * Perform key encapsulation (KEM)
     * 
     * @param {Uint8Array} recipientPublicKey - Recipient's public key
     * @returns {Promise<{ciphertext: Uint8Array, sharedSecret: Uint8Array}>}
     */
    async function encapsulate(recipientPublicKey) {
        // Generate ephemeral keypair
        const ephemeralKeyPair = await crypto.subtle.generateKey(
            {
                name: 'ECDH',
                namedCurve: 'P-384'
            },
            true,
            ['deriveBits']
        );

        // Extract actual public key length
        const pubKeyLen = recipientPublicKey[KYBER_PUBLIC_KEY_SIZE - 4] 
            ? ((recipientPublicKey[KYBER_PUBLIC_KEY_SIZE - 4] << 8) | recipientPublicKey[KYBER_PUBLIC_KEY_SIZE - 3])
            : 120; // Default SPKI P-384 length

        // Import recipient's public key
        const recipientPubKeyRaw = recipientPublicKey.slice(0, pubKeyLen || 120);
        const recipientPubKey = await crypto.subtle.importKey(
            'spki',
            recipientPubKeyRaw,
            { name: 'ECDH', namedCurve: 'P-384' },
            false,
            []
        );

        // Derive shared secret
        const sharedBits = await crypto.subtle.deriveBits(
            { name: 'ECDH', public: recipientPubKey },
            ephemeralKeyPair.privateKey,
            384
        );

        // Export ephemeral public key as ciphertext
        const ephemeralPubRaw = await crypto.subtle.exportKey('spki', ephemeralKeyPair.publicKey);
        const ciphertext = new Uint8Array(KYBER_CIPHERTEXT_SIZE);
        ciphertext.set(new Uint8Array(ephemeralPubRaw), 0);
        ciphertext[KYBER_CIPHERTEXT_SIZE - 2] = (ephemeralPubRaw.byteLength >> 8) & 0xFF;
        ciphertext[KYBER_CIPHERTEXT_SIZE - 1] = ephemeralPubRaw.byteLength & 0xFF;

        // Hash shared bits to get 32-byte shared secret
        const sharedSecretHash = await crypto.subtle.digest('SHA-256', sharedBits);
        const sharedSecret = new Uint8Array(sharedSecretHash);

        return { ciphertext, sharedSecret };
    }

    /**
     * Perform key decapsulation (KEM)
     * 
     * @param {Uint8Array} ciphertext - Ciphertext from encapsulation
     * @param {Uint8Array} privateKey - Recipient's private key
     * @returns {Promise<Uint8Array>} Shared secret
     */
    async function decapsulate(ciphertext, privateKey) {
        // Extract actual lengths
        const privKeyLen = (privateKey[KYBER_PRIVATE_KEY_SIZE - 2] << 8) | privateKey[KYBER_PRIVATE_KEY_SIZE - 1];
        const ctLen = (ciphertext[KYBER_CIPHERTEXT_SIZE - 2] << 8) | ciphertext[KYBER_CIPHERTEXT_SIZE - 1];

        // Import private key
        const privKeyRaw = privateKey.slice(0, privKeyLen || 185);
        const privKey = await crypto.subtle.importKey(
            'pkcs8',
            privKeyRaw,
            { name: 'ECDH', namedCurve: 'P-384' },
            false,
            ['deriveBits']
        );

        // Import ephemeral public key from ciphertext
        const ephemeralPubRaw = ciphertext.slice(0, ctLen || 120);
        const ephemeralPubKey = await crypto.subtle.importKey(
            'spki',
            ephemeralPubRaw,
            { name: 'ECDH', namedCurve: 'P-384' },
            false,
            []
        );

        // Derive shared secret
        const sharedBits = await crypto.subtle.deriveBits(
            { name: 'ECDH', public: ephemeralPubKey },
            privKey,
            384
        );

        // Hash shared bits to get 32-byte shared secret
        const sharedSecretHash = await crypto.subtle.digest('SHA-256', sharedBits);
        return new Uint8Array(sharedSecretHash);
    }

    /**
     * Derive an AES-256 key from passphrase using PBKDF2
     * 
     * @param {string} passphrase - User's passphrase
     * @param {Uint8Array} salt - Random salt
     * @returns {Promise<CryptoKey>}
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
     * 
     * @param {Uint8Array} privateKey - Private key to encrypt
     * @param {string} passphrase - User's passphrase
     * @returns {Promise<{ciphertext: Uint8Array, salt: Uint8Array, nonce: Uint8Array}>}
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
     * 
     * @param {Uint8Array} ciphertext - Encrypted private key
     * @param {Uint8Array} salt - Salt used for key derivation
     * @param {Uint8Array} nonce - Nonce used for encryption
     * @param {string} passphrase - User's passphrase
     * @returns {Promise<Uint8Array>} Decrypted private key
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
     * 
     * @param {string} message - Plaintext message
     * @param {Uint8Array} sharedSecret - 32-byte shared secret
     * @returns {Promise<{ciphertext: Uint8Array, nonce: Uint8Array}>}
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
     * 
     * @param {Uint8Array} ciphertext - Encrypted message
     * @param {Uint8Array} nonce - Nonce used for encryption
     * @param {Uint8Array} sharedSecret - 32-byte shared secret
     * @returns {Promise<string>} Decrypted message
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
        KYBER_PUBLIC_KEY_SIZE,
        KYBER_PRIVATE_KEY_SIZE,
        KYBER_CIPHERTEXT_SIZE,
        KYBER_SHARED_SECRET_SIZE
    };
})();
