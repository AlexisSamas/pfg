from datetime import datetime
from typing import List

from sqlalchemy import and_, desc
from sqlalchemy.orm import Session

from app.models.access_decision import AccessDecision
from app.models.exam_session import ExamSession
from app.models.scoring_result import ScoringResult
from app.models.user import User
from app.models.wait_period import WaitPeriod
from app.schemas.dashboard import DashboardUserStatus, ManualGrantRequest
from app.services import cooldown_cache


class DashboardException(Exception):
    """Base exception for dashboard service errors."""


class DashboardNotFoundException(DashboardException):
    """Raised when a required dashboard resource does not exist."""


def _manual_grant_time(access_decision: AccessDecision):
    return access_decision.consumed_at or access_decision.decided_at


def _scoring_result_time(session: ExamSession):
    if session.scoring_result is None:
        return session.completed_at or session.started_at
    return session.scoring_result.computed_at or session.completed_at or session.started_at


def _manual_grant_is_after_time(
    manual_decision: AccessDecision | None,
    reference_time: datetime | None,
) -> bool:
    if manual_decision is None:
        return False

    manual_time = _manual_grant_time(manual_decision)
    if manual_time is None or reference_time is None:
        return True

    return manual_time >= reference_time


def _latest_scoring_time(sessions: list[ExamSession]) -> datetime | None:
    scored_times = [
        _scoring_result_time(session)
        for session in sessions
        if session.scoring_result is not None
    ]
    scored_times = [scoring_time for scoring_time in scored_times if scoring_time is not None]

    return max(scored_times) if scored_times else None


def _latest_scored_session(sessions: list[ExamSession]) -> ExamSession | None:
    scored_sessions = [session for session in sessions if session.scoring_result is not None]
    if not scored_sessions:
        return None

    return max(
        scored_sessions,
        key=lambda session: (
            _scoring_result_time(session) or datetime.min,
            session.attempt_number or 0,
            session.id or 0,
        ),
    )


def get_context_user_statuses(
    db: Session,
    context_id: str,
) -> List[DashboardUserStatus]:
    sessions = (
        db.query(ExamSession)
        .join(User)
        .filter(ExamSession.context_id == context_id)
        .order_by(
            ExamSession.user_id,
            desc(ExamSession.attempt_number),
            desc(ExamSession.started_at),
            desc(ExamSession.id),
        )
        .all()
    )

    sessions_by_user = {}
    for session in sessions:
        sessions_by_user.setdefault(session.user_id, []).append(session)

    now = datetime.utcnow()
    statuses = []
    for user_sessions in sessions_by_user.values():
        session = user_sessions[0]
        result_session = _latest_scored_session(user_sessions) or session
        scoring_result = result_session.scoring_result
        active_wait = (
            db.query(WaitPeriod)
            .filter(
                and_(
                    WaitPeriod.user_id == session.user_id,
                    WaitPeriod.context_id == context_id,
                    WaitPeriod.wait_until > now,
                )
            )
            .order_by(desc(WaitPeriod.wait_until), desc(WaitPeriod.id))
            .first()
        )
        manual_decision = (
            db.query(AccessDecision)
            .filter(
                and_(
                    AccessDecision.user_id == session.user_id,
                    AccessDecision.context_id == context_id,
                    AccessDecision.decision == "ACCESO",
                    AccessDecision.consumed_by == "manual_grant",
                )
            )
            .order_by(desc(AccessDecision.consumed_at), desc(AccessDecision.decided_at), desc(AccessDecision.id))
            .first()
        )
        manual_grant = _manual_grant_is_after_time(
            manual_decision=manual_decision,
            reference_time=_latest_scoring_time(user_sessions),
        )

        updated_at = None
        if manual_grant:
            updated_at = manual_decision.consumed_at or manual_decision.decided_at
        elif scoring_result is not None:
            updated_at = scoring_result.computed_at
        elif session.completed_at is not None:
            updated_at = session.completed_at
        else:
            updated_at = session.started_at

        latest_score = scoring_result.score if scoring_result else None
        latest_decision = scoring_result.decision if scoring_result else None
        if manual_grant:
            latest_score = manual_decision.score
            latest_decision = manual_decision.decision

        statuses.append(
            DashboardUserStatus(
                user_id=session.user.id,
                username=session.user.username,
                email=session.user.email,
                context_id=context_id,
                latest_session_id=session.id,
                latest_attempt_number=session.attempt_number,
                latest_status=session.status,
                latest_score=latest_score,
                latest_decision=latest_decision,
                weakest_metric=scoring_result.weakest_metric if scoring_result else None,
                recommendation_key=(
                    scoring_result.recommendation_key if scoring_result else None
                ),
                wait_until=active_wait.wait_until if active_wait else None,
                manual_grant=manual_grant,
                updated_at=updated_at,
            )
        )

    return statuses


def grant_manual_access(
    db: Session,
    request: ManualGrantRequest,
) -> AccessDecision:
    user = db.query(User).filter(User.id == request.user_id).first()
    if user is None:
        raise DashboardNotFoundException(
            f"Usuario {request.user_id} no encontrado"
        )

    scored_session = (
        db.query(ExamSession)
        .join(ScoringResult)
        .filter(
            and_(
                ExamSession.user_id == request.user_id,
                ExamSession.context_id == request.context_id,
            )
        )
        .order_by(
            desc(ScoringResult.computed_at),
            desc(ExamSession.completed_at),
            desc(ExamSession.attempt_number),
            desc(ExamSession.id),
        )
        .first()
    )
    latest_session = (
        db.query(ExamSession)
        .filter(
            and_(
                ExamSession.user_id == request.user_id,
                ExamSession.context_id == request.context_id,
            )
        )
        .order_by(
            desc(ExamSession.attempt_number),
            desc(ExamSession.started_at),
            desc(ExamSession.id),
        )
        .first()
    )
    session = scored_session or latest_session
    if session is None:
        raise DashboardNotFoundException(
            "No hay sesion para ese usuario y contexto"
        )

    now = datetime.utcnow()
    score = session.scoring_result.score if session.scoring_result else None
    access_decision = (
        db.query(AccessDecision)
        .filter(AccessDecision.session_id == session.id)
        .first()
    )

    if access_decision is None:
        access_decision = AccessDecision(
            session_id=session.id,
            user_id=session.user_id,
            context_id=session.context_id,
            decision="ACCESO",
            score=score,
            consumed_by="manual_grant",
            consumed_at=now,
        )
        db.add(access_decision)
    else:
        access_decision.user_id = session.user_id
        access_decision.context_id = session.context_id
        access_decision.decision = "ACCESO"
        access_decision.score = score
        access_decision.consumed_by = "manual_grant"
        access_decision.consumed_at = now

    db.query(WaitPeriod).filter(
        and_(
            WaitPeriod.user_id == session.user_id,
            WaitPeriod.context_id == session.context_id,
            WaitPeriod.wait_until > now,
        )
    ).delete(synchronize_session=False)

    db.commit()
    cooldown_cache.delete_cooldown(
        user_id=session.user_id,
        context_id=session.context_id,
    )
    db.refresh(access_decision)

    return access_decision
