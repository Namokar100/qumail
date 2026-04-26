"""
Configuration loader for Key Service.
Reads from config.yaml mounted at /app/config/config.yaml
"""
import os
from pathlib import Path
from typing import List
from pydantic import BaseModel
from pydantic_settings import BaseSettings
import yaml


class DatabaseConfig(BaseModel):
    """Database configuration."""
    url: str = "postgresql+asyncpg://roundcube:roundcube_pass@db:5432/roundcube"


class CorsConfig(BaseModel):
    """CORS configuration."""
    origins: List[str] = [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "https://localhost:1443",
        "https://127.0.0.1:1443",
    ]


class ServerConfig(BaseModel):
    """Server configuration."""
    host: str = "0.0.0.0"
    port: int = 8081


class CryptoConfig(BaseModel):
    """Cryptography configuration."""
    algorithm: str = "Kyber768"
    pbkdf2_iterations: int = 100_000


class Settings(BaseModel):
    """Main settings container."""
    database: DatabaseConfig = DatabaseConfig()
    cors: CorsConfig = CorsConfig()
    server: ServerConfig = ServerConfig()
    crypto: CryptoConfig = CryptoConfig()


def load_settings() -> Settings:
    """
    Load settings from config.yaml if it exists,
    otherwise use defaults. Environment variables override config file.
    """
    config_paths = [
        Path("/app/config/config.yaml"),  # Docker mount path
        Path("config/config.yaml"),        # Local dev path
    ]
    
    config_data = {}
    
    # Try to load from config file
    for config_path in config_paths:
        if config_path.exists():
            with open(config_path, "r") as f:
                config_data = yaml.safe_load(f) or {}
            break
    
    # Environment variable overrides
    if os.getenv("DATABASE_URL"):
        if "database" not in config_data:
            config_data["database"] = {}
        config_data["database"]["url"] = os.getenv("DATABASE_URL")
    
    return Settings(**config_data)


# Global settings instance
settings = load_settings()
