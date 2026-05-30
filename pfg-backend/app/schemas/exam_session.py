from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class SessionStatus(str, Enum):
    CREATED = "created"
    ACTIVE = "active"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class SessionCreate(BaseModel):
    context_id: str = Field(..., min_length=1, max_length=255)


class SessionResponse(BaseModel):
    id: int
    user_id: int
    context_id: str
    attempt_number: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    status: SessionStatus

    model_config = ConfigDict(from_attributes=True)
