"""
Inicialización de la base de datos.

Importa Base y todos los modelos para registrarlos en SQLAlchemy,
y ejecuta la creación de tablas mediante Base.metadata.create_all.
"""

from app.database.session import engine
from app.database.base import Base

# Es fundamental importar todos los modelos aquí para que SQLAlchemy
# los registre en Base.metadata antes de llamar a create_all.
from app.models.user import User
from app.models.exam_session import ExamSession
from app.models.game_event import GameEvent
from app.models.scoring_result import ScoringResult
from app.models.wait_period import WaitPeriod
from app.models.access_decision import AccessDecision


def init_db() -> None:
    """Crea todas las tablas definidas en los modelos si no existen."""
    Base.metadata.create_all(bind=engine)
