"""
API routes for key management.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional

from app.database import get_db
from app.models import UserKey
from app.crypto import bytes_to_base64, base64_to_bytes

router = APIRouter(prefix="/keys", tags=["keys"])


# Request/Response schemas
class PublicKeyResponse(BaseModel):
    """Response for public key lookup."""
    email: str
    public_key: str  # Base64-encoded
    created_at: datetime

    class Config:
        from_attributes = True


class GenerateKeyRequest(BaseModel):
    """Request to store a new keypair."""
    user_email: EmailStr
    public_key: str  # Base64-encoded Kyber public key
    encrypted_private_key: str  # Base64-encoded encrypted private key
    salt: str  # Base64-encoded salt


class GenerateKeyResponse(BaseModel):
    """Response after storing keypair."""
    message: str
    email: str


class PrivateKeyResponse(BaseModel):
    """Response for private key retrieval."""
    encrypted_private_key: str  # Base64-encoded
    salt: str  # Base64-encoded


class KeyRotateRequest(BaseModel):
    """Request to rotate keys."""
    user_email: EmailStr
    new_public_key: str
    new_encrypted_private_key: str
    new_salt: str


@router.get("/{email}/public", response_model=PublicKeyResponse)
async def get_public_key(
    email: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get a user's public key by email address.
    
    This endpoint is public - anyone can fetch a public key to encrypt
    messages to a user.
    """
    result = await db.execute(
        select(UserKey).where(UserKey.user_email == email)
    )
    user_key = result.scalar_one_or_none()
    
    if not user_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No PQC keys found for user: {email}"
        )
    
    return PublicKeyResponse(
        email=user_key.user_email,
        public_key=bytes_to_base64(user_key.kyber_public_key),
        created_at=user_key.created_at
    )


@router.post("/generate", response_model=GenerateKeyResponse, status_code=status.HTTP_201_CREATED)
async def store_keypair(
    request: GenerateKeyRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Store a newly generated keypair.
    
    The client generates the Kyber keypair in the browser,
    encrypts the private key with the user's passphrase,
    and sends both keys here for storage.
    """
    # Check if user already has keys
    result = await db.execute(
        select(UserKey).where(UserKey.user_email == request.user_email)
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"User {request.user_email} already has PQC keys. Use /keys/rotate to update."
        )
    
    # Decode and validate key sizes
    try:
        public_key_bytes = base64_to_bytes(request.public_key)
        encrypted_private_key_bytes = base64_to_bytes(request.encrypted_private_key)
        salt_bytes = base64_to_bytes(request.salt)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid base64 encoding: {str(e)}"
        )
    
    # Validate Kyber768 public key size (1184 bytes)
    if len(public_key_bytes) != 1184:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid public key size. Expected 1184 bytes, got {len(public_key_bytes)}"
        )
    
    # Create new key record
    user_key = UserKey(
        user_email=request.user_email,
        kyber_public_key=public_key_bytes,
        kyber_private_key_encrypted=encrypted_private_key_bytes,
        key_encryption_salt=salt_bytes,
        created_at=datetime.utcnow()
    )
    
    db.add(user_key)
    await db.commit()
    
    return GenerateKeyResponse(
        message="Keys stored successfully",
        email=request.user_email
    )


@router.get("/my/private", response_model=PrivateKeyResponse)
async def get_private_key(
    user_email: str,  # In production, get from JWT token
    db: AsyncSession = Depends(get_db)
):
    """
    Get the current user's encrypted private key.
    
    NOTE: In production, user_email should come from authenticated JWT token,
    not as a query parameter. This is simplified for demonstration.
    """
    result = await db.execute(
        select(UserKey).where(UserKey.user_email == user_email)
    )
    user_key = result.scalar_one_or_none()
    
    if not user_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No PQC keys found for current user"
        )
    
    return PrivateKeyResponse(
        encrypted_private_key=bytes_to_base64(user_key.kyber_private_key_encrypted),
        salt=bytes_to_base64(user_key.key_encryption_salt)
    )


@router.post("/rotate", response_model=GenerateKeyResponse)
async def rotate_keys(
    request: KeyRotateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Rotate a user's keys.
    
    This replaces the existing keypair with a new one.
    Used when a user wants to regenerate their keys.
    """
    result = await db.execute(
        select(UserKey).where(UserKey.user_email == request.user_email)
    )
    user_key = result.scalar_one_or_none()
    
    if not user_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existing keys found for user: {request.user_email}"
        )
    
    # Decode new keys
    try:
        new_public_key_bytes = base64_to_bytes(request.new_public_key)
        new_encrypted_private_key_bytes = base64_to_bytes(request.new_encrypted_private_key)
        new_salt_bytes = base64_to_bytes(request.new_salt)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid base64 encoding: {str(e)}"
        )
    
    # Validate key size
    if len(new_public_key_bytes) != 1184:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid public key size. Expected 1184 bytes, got {len(new_public_key_bytes)}"
        )
    
    # Update keys
    user_key.kyber_public_key = new_public_key_bytes
    user_key.kyber_private_key_encrypted = new_encrypted_private_key_bytes
    user_key.key_encryption_salt = new_salt_bytes
    user_key.rotated_at = datetime.utcnow()
    
    await db.commit()
    
    return GenerateKeyResponse(
        message="Keys rotated successfully",
        email=request.user_email
    )
