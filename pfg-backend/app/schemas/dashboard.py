from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.scoring import DecisionType


class DashboardUserStatus(BaseModel):
    user_id: int
    username: str
    email: str
    context_id: str
    latest_session_id: int
    latest_attempt_number: int
    latest_status: str
    latest_score: Optional[float] = None
    latest_decision: Optional[DecisionType] = None
    weakest_metric: Optional[str] = None
    recommendation_key: Optional[str] = None
    wait_until: Optional[datetime] = None
    manual_grant: bool = False
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ManualGrantRequest(BaseModel):
    user_id: int
    context_id: str = Field(..., min_length=1, max_length=255)
    reason: Optional[str] = Field(None, max_length=255)


class ManualGrantResponse(BaseModel):
    granted: bool
    user_id: int
    context_id: str
    decision: DecisionType
