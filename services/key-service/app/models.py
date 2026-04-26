"""
SQLAlchemy models for the Key Service.
"""
from datetime import datetime
from sqlalchemy import Column, String, LargeBinary, DateTime
from app.database import Base


class UserKey(Base):
    """Model for storing user PQC key pairs."""
    
    __tablename__ = "user_keys"
    
    # Primary key - user's email address
    user_email = Column(String(255), primary_key=True, index=True)
    
    # Kyber768 public key (1184 bytes)
    kyber_public_key = Column(LargeBinary, nullable=False)
    
    # Encrypted Kyber768 private key (2400 bytes + encryption overhead)
    kyber_private_key_encrypted = Column(LargeBinary, nullable=False)
    
    # Salt used for key derivation (16 bytes)
    key_encryption_salt = Column(LargeBinary, nullable=False)
    
    # Nonce used for AES-GCM encryption (12 bytes)
    key_encryption_nonce = Column(LargeBinary, nullable=True)  # nullable for backwards compatibility
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    rotated_at = Column(DateTime, nullable=True)
    
    def __repr__(self):
        return f"<UserKey(email={self.user_email})>"
