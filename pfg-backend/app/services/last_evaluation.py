from datetime import datetime
import logging
from typing import Any

from sqlalchemy import and_, desc
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.auth.jwt_service import create_access_token
from app.models.access_decision import AccessDecision
from app.models.exam_session import ExamSession
from app.models.scoring_result import ScoringResult
from app.models.user import User
from app.models.wait_period import WaitPeriod

logger = logging.getLogger(__name__)


def _isoformat(value: datetime | None) -> str | None:
    if value is None:
        return None

    serialized = value.isoformat()

    return f"{serialized}Z" if value.tzinfo is None else serialized


def _manual_grant_time(access_decision: AccessDecision) -> datetime | None:
    return access_decision.consumed_at or access_decision.decided_at


def _scoring_time(session: ExamSession, scoring_result: ScoringResult) -> datetime | None:
    return scoring_result.computed_at or session.completed_at or session.started_at


def _manual_grant_is_after_scoring(
    manual_decision: AccessDecision | None,
    session: ExamSession,
    scoring_result: ScoringResult,
) -> bool:
    if manual_decision is None:
        return False

    manual_time = _manual_grant_time(manual_decision)
    result_time = _scoring_time(session, scoring_result)

    if manual_time is None or result_time is None:
        return True

    return manual_time > result_time


def _latest_manual_grant(db: Session, user_id: int) -> AccessDecision | None:
    return (
        db.query(AccessDecision)
        .filter(
            and_(
                AccessDecision.user_id == user_id,
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


def _latest_context_manual_grant(
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


def _manual_grant_is_currenter_than_scoring(
    manual_decision: AccessDecision | None,
    session: ExamSession,
    scoring_result: ScoringResult,
) -> bool:
    if manual_decision is None:
        return False

    if manual_decision.context_id == session.context_id:
        return _manual_grant_is_after_scoring(
            manual_decision=manual_decision,
            session=session,
            scoring_result=scoring_result,
        )

    manual_time = _manual_grant_time(manual_decision)
    result_time = _scoring_time(session, scoring_result)

    if manual_time is None or result_time is None:
        return True

    return manual_time > result_time


def _manual_grant_claim(
    manual_decision: AccessDecision,
) -> dict[str, Any]:
    session = manual_decision.session
    source_result = session.scoring_result if session else None
    computed_at = _manual_grant_time(manual_decision)

    return {
        "session_id": manual_decision.session_id,
        "context_id": manual_decision.context_id,
        "score": manual_decision.score,
        "decision": "ACCESO",
        "weakest_metric": source_result.weakest_metric if source_result else None,
        "recommendation_key": (
            source_result.recommendation_key if source_result else None
        ),
        "computed_at": _isoformat(computed_at),
        "wait_until": None,
        "requires_manual_grant": False,
        "manual_grant": True,
    }


def _get_wait_period_for_session(
    db: Session,
    session: ExamSession,
) -> WaitPeriod | None:
    same_attempt_wait = (
        db.query(WaitPeriod)
        .filter(
            and_(
                WaitPeriod.user_id == session.user_id,
                WaitPeriod.context_id == session.context_id,
                WaitPeriod.attempt_number == session.attempt_number,
            )
        )
        .order_by(desc(WaitPeriod.wait_until), desc(WaitPeriod.id))
        .first()
    )

    if same_attempt_wait is not None:
        return same_attempt_wait

    return (
        db.query(WaitPeriod)
        .filter(
            and_(
                WaitPeriod.user_id == session.user_id,
                WaitPeriod.context_id == session.context_id,
            )
        )
        .order_by(desc(WaitPeriod.wait_until), desc(WaitPeriod.id))
        .first()
    )


def get_last_evaluation_claim(
    db: Session,
    user_id: int,
) -> dict[str, Any] | None:
    latest_manual_grant = _latest_manual_grant(db=db, user_id=user_id)
    scoring_result = (
        db.query(ScoringResult)
        .join(ExamSession)
        .filter(ExamSession.user_id == user_id)
        .order_by(
            desc(ScoringResult.computed_at),
            desc(ExamSession.completed_at),
            desc(ExamSession.id),
        )
        .first()
    )

    if scoring_result is None:
        if latest_manual_grant is not None:
            return _manual_grant_claim(latest_manual_grant)
        return None

    session = scoring_result.session
    manual_grant = _manual_grant_is_currenter_than_scoring(
        manual_decision=latest_manual_grant,
        session=session,
        scoring_result=scoring_result,
    )
    if manual_grant and latest_manual_grant is not None:
        return _manual_grant_claim(latest_manual_grant)

    decision = "ACCESO" if manual_grant else scoring_result.decision
    wait_period = (
        _get_wait_period_for_session(db=db, session=session)
        if decision == "ESPERA"
        else None
    )

    return {
        "session_id": session.id,
        "context_id": session.context_id,
        "score": scoring_result.score,
        "decision": decision,
        "weakest_metric": scoring_result.weakest_metric,
        "recommendation_key": scoring_result.recommendation_key,
        "computed_at": _isoformat(scoring_result.computed_at),
        "wait_until": None if manual_grant else _isoformat(wait_period.wait_until if wait_period else None),
        "requires_manual_grant": decision == "BLOQUEO" and not manual_grant,
        "manual_grant": manual_grant,
    }


def get_context_last_evaluation_claim(
    db: Session,
    user_id: int,
    context_id: str,
) -> dict[str, Any] | None:
    latest_manual_grant = _latest_context_manual_grant(
        db=db,
        user_id=user_id,
        context_id=context_id,
    )
    scoring_result = (
        db.query(ScoringResult)
        .join(ExamSession)
        .filter(
            and_(
                ExamSession.user_id == user_id,
                ExamSession.context_id == context_id,
            )
        )
        .order_by(
            desc(ScoringResult.computed_at),
            desc(ExamSession.completed_at),
            desc(ExamSession.id),
        )
        .first()
    )

    if scoring_result is None:
        if latest_manual_grant is not None:
            return _manual_grant_claim(latest_manual_grant)
        return None

    session = scoring_result.session
    manual_grant = _manual_grant_is_currenter_than_scoring(
        manual_decision=latest_manual_grant,
        session=session,
        scoring_result=scoring_result,
    )
    if manual_grant and latest_manual_grant is not None:
        return _manual_grant_claim(latest_manual_grant)

    decision = "ACCESO" if manual_grant else scoring_result.decision
    wait_period = (
        _get_wait_period_for_session(db=db, session=session)
        if decision == "ESPERA"
        else None
    )

    return {
        "session_id": session.id,
        "context_id": session.context_id,
        "score": scoring_result.score,
        "decision": decision,
        "weakest_metric": scoring_result.weakest_metric,
        "recommendation_key": scoring_result.recommendation_key,
        "computed_at": _isoformat(scoring_result.computed_at),
        "wait_until": None if manual_grant else _isoformat(wait_period.wait_until if wait_period else None),
        "requires_manual_grant": decision == "BLOQUEO" and not manual_grant,
        "manual_grant": manual_grant,
    }


def get_context_attempt_claim(
    db: Session,
    user_id: int,
    context_id: str,
) -> dict[str, Any]:
    attempt_count = (
        db.query(func.count(ExamSession.id))
        .filter(
            and_(
                ExamSession.user_id == user_id,
                ExamSession.context_id == context_id,
            )
        )
        .scalar()
        or 0
    )

    return {
        "context_id": context_id,
        "attempt_count": int(attempt_count),
        "max_attempts": getattr(settings, "MAX_ATTEMPTS", 3),
    }


def get_attempt_context_claims(db: Session, user_id: int) -> list[dict[str, Any]]:
    rows = (
        db.query(
            ExamSession.context_id,
            func.count(ExamSession.id).label("attempt_count"),
        )
        .filter(ExamSession.user_id == user_id)
        .group_by(ExamSession.context_id)
        .all()
    )

    max_attempts = getattr(settings, "MAX_ATTEMPTS", 3)

    return [
        {
            "context_id": context_id,
            "attempt_count": int(attempt_count),
            "max_attempts": max_attempts,
        }
        for context_id, attempt_count in rows
    ]


def create_user_access_token(db: Session, user: User) -> str:
    try:
        last_evaluation = get_last_evaluation_claim(db=db, user_id=user.id)
    except Exception:
        logger.exception("Could not build last_evaluation claim for user %s", user.id)
        last_evaluation = None

    return create_access_token(
        data={
            "sub": str(user.id),
            "role": user.role,
            "last_evaluation": last_evaluation,
            "attempts_by_context": get_attempt_context_claims(
                db=db,
                user_id=user.id,
            ),
        }
    )
