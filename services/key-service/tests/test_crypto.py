"""
Unit tests for crypto module.
"""
import pytest
from app.crypto import (
    generate_kyber_keypair,
    encapsulate,
    decapsulate,
    encrypt_private_key,
    decrypt_private_key,
    EncryptedPrivateKey,
    bytes_to_base64,
    base64_to_bytes,
)


class TestKyberKeyGeneration:
    """Tests for Kyber768 key generation."""
    
    def test_generate_keypair_returns_correct_sizes(self):
        """Verify generated keypair has correct sizes."""
        keypair = generate_kyber_keypair()
        
        # Kyber768 public key is 1184 bytes
        assert len(keypair.public_key) == 1184
        
        # Kyber768 private key is 2400 bytes
        assert len(keypair.private_key) == 2400
    
    def test_generate_keypair_unique(self):
        """Each generation should produce unique keys."""
        keypair1 = generate_kyber_keypair()
        keypair2 = generate_kyber_keypair()
        
        assert keypair1.public_key != keypair2.public_key
        assert keypair1.private_key != keypair2.private_key


class TestKyberEncapsulation:
    """Tests for Kyber768 encapsulation/decapsulation."""
    
    def test_encapsulate_decapsulate_shared_secret_matches(self):
        """Encapsulation and decapsulation should produce matching shared secrets."""
        keypair = generate_kyber_keypair()
        
        # Sender encapsulates
        encap_result = encapsulate(keypair.public_key)
        
        # Verify ciphertext size (1088 bytes for Kyber768)
        assert len(encap_result.ciphertext) == 1088
        
        # Verify shared secret size (32 bytes)
        assert len(encap_result.shared_secret) == 32
        
        # Recipient decapsulates
        decap_shared_secret = decapsulate(encap_result.ciphertext, keypair.private_key)
        
        # Shared secrets must match
        assert encap_result.shared_secret == decap_shared_secret


class TestPrivateKeyEncryption:
    """Tests for private key passphrase encryption."""
    
    def test_encrypt_decrypt_private_key(self):
        """Private key can be encrypted and decrypted with correct passphrase."""
        keypair = generate_kyber_keypair()
        passphrase = "test-passphrase-123!"
        
        # Encrypt
        encrypted = encrypt_private_key(keypair.private_key, passphrase)
        
        # Verify salt and nonce sizes
        assert len(encrypted.salt) == 16
        assert len(encrypted.nonce) == 12
        
        # Decrypt
        decrypted = decrypt_private_key(encrypted, passphrase)
        
        assert decrypted == keypair.private_key
    
    def test_wrong_passphrase_fails(self):
        """Decryption with wrong passphrase should fail."""
        keypair = generate_kyber_keypair()
        
        encrypted = encrypt_private_key(keypair.private_key, "correct-passphrase")
        
        with pytest.raises(Exception):  # InvalidTag from cryptography
            decrypt_private_key(encrypted, "wrong-passphrase")


class TestBase64Utilities:
    """Tests for base64 encoding utilities."""
    
    def test_roundtrip(self):
        """Base64 encode and decode should be reversible."""
        original = b"test data \x00\xff"
        
        encoded = bytes_to_base64(original)
        decoded = base64_to_bytes(encoded)
        
        assert decoded == original
