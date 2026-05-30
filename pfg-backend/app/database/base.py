"""
Base declarativa de SQLAlchemy.

Todos los modelos de la aplicación deben heredar de esta clase
para que SQLAlchemy los registre.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Clase base para todos los modelos ORM de la aplicación."""
    pass
