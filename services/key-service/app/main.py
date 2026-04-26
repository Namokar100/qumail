"""
QuMail Key Management Service

FastAPI application for managing PQC (Kyber768) key pairs.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routes.keys import router as keys_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup/shutdown."""
    # Startup: Initialize database tables
    await init_db()
    yield
    # Shutdown: Cleanup if needed


app = FastAPI(
    title="QuMail Key Service",
    description="Post-Quantum Cryptography Key Management for QuMail E2E Encryption",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware - origins loaded from config.yaml
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(keys_router)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "key-service"}


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "service": "QuMail Key Service",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "health": "/health",
            "get_public_key": "/keys/{email}/public",
            "store_keys": "/keys/generate",
            "get_private_key": "/keys/my/private",
            "rotate_keys": "/keys/rotate"
        }
    }
