"""
Configuración central del proyecto.

Lee variables de entorno desde .env y expone un objeto Settings
accesible en toda la aplicación.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/pfg_db",
    )
    
    # Seguridad y JWT
    SECRET_KEY: str = os.getenv(
        "SECRET_KEY",
        "development-secret-key-32-chars-long-or-more-change-me",
    )
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    
    # Parámetros del Negocio / Evaluación Cognitiva
    DEFAULT_ATTENTION_THRESHOLD: float = float(os.getenv("DEFAULT_ATTENTION_THRESHOLD", "60.0"))
    DEFAULT_WAIT_MINUTES: int = int(os.getenv("DEFAULT_WAIT_MINUTES", "10"))
    MAX_ATTEMPTS: int = int(os.getenv("MAX_ATTEMPTS", "3"))

    # Redis: cache temporal para cooldowns. PostgreSQL sigue siendo la fuente persistente.
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    ENABLE_REDIS: bool = os.getenv("ENABLE_REDIS", "false").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


settings = Settings()
