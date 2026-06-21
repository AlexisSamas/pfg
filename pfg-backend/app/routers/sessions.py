from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.session import get_db
from app.models.user import User
from app.models.exam_session import ExamSession
from app.models.wait_period import WaitPeriod
from app.schemas.exam_session import SessionCreate, SessionResponse
from app.schemas.game_event import GameEventBatch, GameEventBatchResponse
from app.schemas.scoring import DecisionResponse, ScoringResultResponse, WaitResponse
from app.services.session import (
    BlockedContextException,
    MaxAttemptsExceededException,
    WaitPeriodException,
    create_exam_session,
)
from app.services.events import save_game_events, SessionException, GameEventException
from app.services.scoring import (
    ScoringException,
    calculate_and_store_scoring_result,
    get_or_create_access_decision,
)
from app.services.last_evaluation import create_user_access_token

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(
    session_data: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return create_exam_session(
            db=db,
            user_id=current_user.id,
            context_id=session_data.context_id,
        )
    except WaitPeriodException as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=exc.detail or str(exc),
        ) from exc
    except BlockedContextException as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": "User is blocked for this context",
                "context_id": exc.context_id,
                "requires_manual_grant": True,
                "reason": "BLOCK decision",
            },
        ) from exc
    except MaxAttemptsExceededException as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": "Maximum attempts exceeded",
                "max_attempts": exc.max_attempts,
                "context_id": exc.context_id,
                "requires_manual_grant": True,
            },
        ) from exc


@router.post("/{session_id}/events", response_model=GameEventBatchResponse, status_code=status.HTTP_201_CREATED)
def add_events(
    session_id: int,
    events_batch: GameEventBatch,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Añade eventos de juego a una sesión de evaluación.
    
    El usuario autenticado debe ser propietario de la sesión.
    """
    # Verificar que la sesión existe
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sesión {session_id} no encontrada",
        )
    
    # Verificar que la sesión pertenece al usuario autenticado
    if session.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permiso para añadir eventos a esta sesión",
        )
    
    # Intentar guardar los eventos
    try:
        events_count = save_game_events(
            db=db,
            session_id=session_id,
            user_id=current_user.id,
            events_batch=events_batch,
        )
        return GameEventBatchResponse(received=events_count)
    except SessionException as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except GameEventException as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("/{session_id}/result", response_model=ScoringResultResponse)
def get_session_result(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Calcula o devuelve el resultado de scoring de una sesion."""
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sesion {session_id} no encontrada",
        )

    if session.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permiso para consultar esta sesion",
        )

    try:
        scoring_result = calculate_and_store_scoring_result(db=db, session=session)
        return ScoringResultResponse.model_validate(scoring_result).model_copy(
            update={
                "new_access_token": create_user_access_token(
                    db=db,
                    user=current_user,
                )
            }
        )
    except ScoringException as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get("/{session_id}/decision", response_model=DecisionResponse)
def get_session_decision(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Devuelve la decision final de acceso de una sesion."""
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sesion {session_id} no encontrada",
        )

    if session.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permiso para consultar esta sesion",
        )

    try:
        access_decision = get_or_create_access_decision(db=db, session=session)
    except ScoringException as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    return DecisionResponse(
        session_id=access_decision.session_id,
        context_id=access_decision.context_id,
        decision=access_decision.decision,
        score=access_decision.score,
    )


@router.get("/{session_id}/wait", response_model=WaitResponse)
def get_session_wait(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Devuelve el periodo de espera asociado a una sesion."""
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sesion {session_id} no encontrada",
        )

    if session.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permiso para consultar esta sesion",
        )

    wait_period = db.query(WaitPeriod).filter(
        and_(
            WaitPeriod.user_id == session.user_id,
            WaitPeriod.context_id == session.context_id,
            WaitPeriod.attempt_number == session.attempt_number,
        )
    ).first()

    if wait_period is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hay periodo de espera asociado a esta sesion",
        )

    return WaitResponse(
        wait_until=wait_period.wait_until,
        recommendation_key=wait_period.recommendation_key,
        reason=wait_period.reason,
    )
