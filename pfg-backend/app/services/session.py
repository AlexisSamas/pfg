from datetime import datetime

from sqlalchemy import and_, desc
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.access_decision import AccessDecision
from app.models.exam_session import ExamSession
from app.models.scoring_result import ScoringResult
from app.models.wait_period import WaitPeriod
from app.services import cooldown_cache


class WaitPeriodException(Exception):
    """Raised when an active wait period blocks a new session."""

    def __init__(self, message: str, detail: dict | None = None):
        self.detail = detail
        super().__init__(message)


class MaxAttemptsExceededException(Exception):
    """Raised when attempts are exhausted for a context."""

    def __init__(self, max_attempts: int, context_id: str):
        self.max_attempts = max_attempts
        self.context_id = context_id
        super().__init__("Maximum attempts exceeded")


class BlockedContextException(Exception):
    """Raised when a prior severe block prevents new attempts."""

    def __init__(self, context_id: str):
        self.context_id = context_id
        super().__init__("User is blocked for this context")


def _decision_time(access_decision: AccessDecision):
    return access_decision.consumed_at or access_decision.decided_at


def _scoring_time(scoring_result: ScoringResult, session: ExamSession):
    return scoring_result.computed_at or session.completed_at or session.started_at


def _latest_manual_grant(
    db: Session,
    user_id: int,
    context_id: str,
) -> AccessDecision | None:
    return (
        db.query(AccessDecision)
        .filter(
            and_(
                AccessDecision.user_id == user_id,
                AccessDecision.context_id == context_id,
                AccessDecision.decision == "ACCESO",
                AccessDecision.consumed_by == "manual_grant",
            )
        )
        .order_by(
            desc(AccessDecision.consumed_at),
            desc(AccessDecision.decided_at),
            desc(AccessDecision.id),
        )
        .first()
    )


def has_valid_manual_grant(
    db: Session,
    user_id: int,
    context_id: str,
) -> bool:
    return _latest_manual_grant(
        db=db,
        user_id=user_id,
        context_id=context_id,
    ) is not None


def _has_manual_grant_after_block(
    db: Session,
    user_id: int,
    context_id: str,
    block_time,
) -> bool:
    manual_grant = _latest_manual_grant(
        db=db,
        user_id=user_id,
        context_id=context_id,
    )
    if manual_grant is None:
        return False

    manual_time = _decision_time(manual_grant)
    if block_time is None or manual_time is None:
        return True

    return manual_time >= block_time


def has_active_block(
    db: Session,
    user_id: int,
    context_id: str,
) -> bool:
    latest_blocked_session = (
        db.query(ExamSession)
        .join(ScoringResult, ScoringResult.session_id == ExamSession.id)
        .filter(
            and_(
                ExamSession.user_id == user_id,
                ExamSession.context_id == context_id,
                ScoringResult.decision == "BLOQUEO",
            )
        )
        .order_by(
            desc(ScoringResult.computed_at),
            desc(ExamSession.completed_at),
            desc(ExamSession.id),
        )
        .first()
    )
    if latest_blocked_session is None or latest_blocked_session.scoring_result is None:
        return False

    block_time = _scoring_time(
        latest_blocked_session.scoring_result,
        latest_blocked_session,
    )
    return not _has_manual_grant_after_block(
        db=db,
        user_id=user_id,
        context_id=context_id,
        block_time=block_time,
    )


def create_exam_session(
    db: Session,
    user_id: int,
    context_id: str,
) -> ExamSession:
    manual_grant = has_valid_manual_grant(
        db=db,
        user_id=user_id,
        context_id=context_id,
    )

    if not manual_grant:
        cached_wait = cooldown_cache.get_active_cooldown(
            user_id=user_id,
            context_id=context_id,
        )
        if cached_wait is not None:
            raise WaitPeriodException(
                "Usuario en espera temporal. Intente mas tarde.",
                detail={
                    "message": "Active cooldown",
                    "wait_until": cached_wait.wait_until.isoformat(),
                    "recommendation_key": cached_wait.recommendation_key,
                    "reason": cached_wait.reason,
                },
            )

        active_wait = db.query(WaitPeriod).filter(
            and_(
                WaitPeriod.user_id == user_id,
                WaitPeriod.context_id == context_id,
                WaitPeriod.wait_until > datetime.utcnow(),
            )
        ).first()

        if active_wait:
            cooldown_cache.set_cooldown_from_wait_period(active_wait)
            raise WaitPeriodException(
                f"Usuario en espera hasta {active_wait.wait_until}. "
                "Intente mas tarde."
            )

        if has_active_block(db=db, user_id=user_id, context_id=context_id):
            raise BlockedContextException(context_id=context_id)

    previous_sessions = db.query(ExamSession).filter(
        and_(
            ExamSession.user_id == user_id,
            ExamSession.context_id == context_id,
        )
    ).count()

    max_attempts = getattr(settings, "MAX_ATTEMPTS", 3)
    if not manual_grant and previous_sessions >= max_attempts:
        raise MaxAttemptsExceededException(
            max_attempts=max_attempts,
            context_id=context_id,
        )

    session = ExamSession(
        user_id=user_id,
        context_id=context_id,
        attempt_number=previous_sessions + 1,
        status="active",
    )

    db.add(session)
    db.commit()
    db.refresh(session)

    return session
