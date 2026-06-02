from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import require_instructor
from app.database.session import get_db
from app.models.user import User
from app.schemas.dashboard import (
    DashboardUserStatus,
    ManualGrantRequest,
    ManualGrantResponse,
)
from app.services.dashboard import (
    DashboardNotFoundException,
    get_context_user_statuses,
    grant_manual_access,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get(
    "/context/{ctx_id}",
    response_model=List[DashboardUserStatus],
)
def get_context_dashboard(
    ctx_id: str,
    _: User = Depends(require_instructor),
    db: Session = Depends(get_db),
):
    return get_context_user_statuses(db=db, context_id=ctx_id)


@router.post("/grant-manual", response_model=ManualGrantResponse)
def create_manual_grant(
    request: ManualGrantRequest,
    _: User = Depends(require_instructor),
    db: Session = Depends(get_db),
):
    try:
        access_decision = grant_manual_access(db=db, request=request)
    except DashboardNotFoundException as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return ManualGrantResponse(
        granted=True,
        user_id=access_decision.user_id,
        context_id=access_decision.context_id,
        decision=access_decision.decision,
    )
