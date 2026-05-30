"""
Configuración de conexión a la base de datos.

Crea el engine de SQLAlchemy y una factoría de sesiones (SessionLocal).
Expone get_db() como dependencia inyectable en FastAPI.

NOTA: La Base declarativa y los modelos se configurarán en Tarea 2.1.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

engine = create_engine(settings.DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependencia FastAPI que abre y cierra una sesión de BD."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
