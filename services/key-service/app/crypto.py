"""
PQC Cryptography utilities using liboqs for Kyber768 operations.
"""
import os
import oqs
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from dataclasses import dataclass
from typing import Tuple
import base64

from app.config import settings

# Constants - loaded from config.yaml
KYBER_ALGORITHM = settings.crypto.algorithm
PBKDF2_ITERATIONS = settings.crypto.pbkdf2_iterations
SALT_LENGTH = 16
NONCE_LENGTH = 12


@dataclass
class KeyPair:
    """Container for a Kyber768 key pair."""
    public_key: bytes
    private_key: bytes


@dataclass
class EncapsulationResult:
    """Container for Kyber encapsulation result."""
    ciphertext: bytes
    shared_secret: bytes


@dataclass
class EncryptedPrivateKey:
    """Container for an encrypted private key."""
    ciphertext: bytes
    salt: bytes
    nonce: bytes


def generate_kyber_keypair() -> KeyPair:
    """
    Generate a Kyber768 key pair.
    
    Returns:
        KeyPair with public_key (1184 bytes) and private_key (2400 bytes)
    """
    with oqs.KeyEncapsulation(KYBER_ALGORITHM) as kem:
        public_key = kem.generate_keypair()
        private_key = kem.export_secret_key()
    return KeyPair(public_key=public_key, private_key=private_key)


def encapsulate(public_key: bytes) -> EncapsulationResult:
    """
    Perform Kyber key encapsulation.
    
    Args:
        public_key: Recipient's Kyber public key
        
    Returns:
        EncapsulationResult with ciphertext (1088 bytes) and shared_secret (32 bytes)
    """
    with oqs.KeyEncapsulation(KYBER_ALGORITHM) as kem:
        ciphertext, shared_secret = kem.encap_secret(public_key)
    return EncapsulationResult(ciphertext=ciphertext, shared_secret=shared_secret)


def decapsulate(ciphertext: bytes, private_key: bytes) -> bytes:
    """
    Perform Kyber key decapsulation.
    
    Args:
        ciphertext: Kyber ciphertext from encapsulation
        private_key: Recipient's Kyber private key
        
    Returns:
        Shared secret (32 bytes)
    """
    with oqs.KeyEncapsulation(KYBER_ALGORITHM, private_key) as kem:
        shared_secret = kem.decap_secret(ciphertext)
    return shared_secret


def derive_key_from_passphrase(passphrase: str, salt: bytes) -> bytes:
    """
    Derive an AES-256 key from a passphrase using PBKDF2.
    
    Args:
        passphrase: User's passphrase
        salt: Random salt bytes
        
    Returns:
        32-byte key suitable for AES-256
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    return kdf.derive(passphrase.encode('utf-8'))


def encrypt_private_key(private_key: bytes, passphrase: str) -> EncryptedPrivateKey:
    """
    Encrypt a private key with a passphrase using AES-256-GCM.
    
    Args:
        private_key: Raw private key bytes
        passphrase: User's passphrase
        
    Returns:
        EncryptedPrivateKey with ciphertext, salt, and nonce
    """
    salt = os.urandom(SALT_LENGTH)
    nonce = os.urandom(NONCE_LENGTH)
    
    key = derive_key_from_passphrase(passphrase, salt)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, private_key, None)
    
    return EncryptedPrivateKey(ciphertext=ciphertext, salt=salt, nonce=nonce)


def decrypt_private_key(encrypted: EncryptedPrivateKey, passphrase: str) -> bytes:
    """
    Decrypt a private key with a passphrase.
    
    Args:
        encrypted: EncryptedPrivateKey container
        passphrase: User's passphrase
        
    Returns:
        Decrypted private key bytes
        
    Raises:
        cryptography.exceptions.InvalidTag: If passphrase is incorrect
    """
    key = derive_key_from_passphrase(passphrase, encrypted.salt)
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(encrypted.nonce, encrypted.ciphertext, None)


# Base64 encoding utilities for API transport
def bytes_to_base64(data: bytes) -> str:
    """Encode bytes to base64 string."""
    return base64.b64encode(data).decode('ascii')


def base64_to_bytes(data: str) -> bytes:
    """Decode base64 string to bytes."""
    return base64.b64decode(data.encode('ascii'))
