from datetime import datetime
from typing import List, Optional
from sqlalchemy import ForeignKey, String, DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base

class ExamSession(Base):
    __tablename__ = "exam_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    context_id: Mapped[str] = mapped_column(String(255), index=True)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="active")  # "active", "completed", "failed"

    # Relaciones
    user: Mapped["User"] = relationship(back_populates="sessions")
    events: Mapped[List["GameEvent"]] = relationship(back_populates="session", cascade="all, delete-orphan")
    scoring_result: Mapped[Optional["ScoringResult"]] = relationship(back_populates="session", uselist=False, cascade="all, delete-orphan")
    access_decisions: Mapped[List["AccessDecision"]] = relationship(back_populates="session", cascade="all, delete-orphan")
