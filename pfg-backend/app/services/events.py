"""
Servicio de eventos de juego.

Proporciona funciones para:
- Guardar eventos de juego asociados a una sesión
- Validar eventos y sesiones
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models.exam_session import ExamSession
from app.models.game_event import GameEvent
from app.schemas.game_event import GameEventBatch, GameType


class SessionException(Exception):
    """Excepción relacionada con la validación de sesiones."""
    pass


class GameEventException(Exception):
    """Excepción relacionada con eventos de juego."""
    pass


def save_game_events(
    db: Session,
    session_id: int,
    user_id: int,
    events_batch: GameEventBatch,
) -> int:
    """
    Guarda eventos de juego asociados a una sesión.

    Args:
        db: Sesión de base de datos.
        session_id: ID de la sesión de evaluación.
        user_id: ID del usuario propietario de la sesión.
        events_batch: Lote de eventos a guardar (GameEventBatch).

    Returns:
        Número de eventos almacenados.

    Raises:
        SessionException: Si la sesión no existe, no pertenece al usuario o está cerrada.
        GameEventException: Si hay eventos inválidos.
    """
    # Validar que la sesión existe
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise SessionException(f"Sesión {session_id} no encontrada")

    # Validar que la sesión pertenece al usuario
    if session.user_id != user_id:
        raise SessionException(
            f"Sesión {session_id} no pertenece al usuario {user_id}"
        )

    # Validar que la sesión no está cerrada/completada
    if session.status not in ["active", "in_progress"]:
        raise SessionException(
            f"No se pueden agregar eventos a una sesión con estado '{session.status}'"
        )

    # Validar y guardar cada evento
    events_count = 0
    for event_data in events_batch.events:
        # Validar game_type
        try:
            game_type = GameType(event_data.game_type)
        except ValueError:
            raise GameEventException(
                f"game_type inválido: {event_data.game_type}. "
                f"Debe ser uno de: {', '.join([g.value for g in GameType])}"
            )

        # event_type ya es validado por Pydantic (string no vacío, max 50 chars)
        # stimulus_type ya es validado por Pydantic (enum o None)

        # Crear y guardar evento
        game_event = GameEvent(
            session_id=session_id,
            game_type=event_data.game_type.value,
            event_type=event_data.event_type,
            timestamp_us=event_data.timestamp_us,
            reaction_time_ms=event_data.reaction_time_ms,
            is_correct=event_data.is_correct,
            stimulus_type=event_data.stimulus_type.value
            if event_data.stimulus_type
            else None,
        )
        db.add(game_event)
        events_count += 1

    # Persistir todos los eventos en la transacción
    db.commit()

    return events_count
