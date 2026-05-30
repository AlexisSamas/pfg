"""
Servicio de sesiones de evaluación.

Proporciona funciones para:
- Crear sesiones de evaluación
- Validar períodos de espera activos
- Calcular attempt_number
"""

from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models.exam_session import ExamSession
from app.models.wait_period import WaitPeriod


class WaitPeriodException(Exception):
    """Excepción cuando existe un período de espera activo."""
    pass


def create_exam_session(
    db: Session,
    user_id: int,
    context_id: str
) -> ExamSession:
    """
    Crea una nueva sesión de evaluación para un usuario y contexto.

    Args:
        db: Sesión de base de datos.
        user_id: ID del usuario.
        context_id: ID del contexto de evaluación.

    Returns:
        ExamSession creada y guardada en base de datos.

    Raises:
        WaitPeriodException: Si existe un período de espera activo para
                           ese usuario y contexto que aún no ha expirado.
    """
    # Verificar si existe un wait_period activo para este usuario y contexto
    active_wait = db.query(WaitPeriod).filter(
        and_(
            WaitPeriod.user_id == user_id,
            WaitPeriod.context_id == context_id,
            WaitPeriod.wait_until > datetime.utcnow()
        )
    ).first()

    if active_wait:
        raise WaitPeriodException(
            f"Usuario en espera hasta {active_wait.wait_until}. "
            f"Intente más tarde."
        )

    # Calcular attempt_number contando sesiones previas del usuario para este context
    previous_sessions = db.query(ExamSession).filter(
        and_(
            ExamSession.user_id == user_id,
            ExamSession.context_id == context_id
        )
    ).count()

    attempt_number = previous_sessions + 1

    # Crear nueva sesión
    session = ExamSession(
        user_id=user_id,
        context_id=context_id,
        attempt_number=attempt_number,
        status="active"
    )

    # Guardar en base de datos
    db.add(session)
    db.commit()
    db.refresh(session)

    return session
