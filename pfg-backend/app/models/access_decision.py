from datetime import datetime
from typing import Optional
from sqlalchemy import ForeignKey, String, DateTime, Float, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base

class AccessDecision(Base):
    __tablename__ = "access_decisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[Optional[int]] = mapped_column(ForeignKey("exam_sessions.id"), nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    context_id: Mapped[str] = mapped_column(String(255), index=True)
    decision: Mapped[str] = mapped_column(String(50))  # "ACCESO", "ESPERA", "BLOQUEO"
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    decided_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    consumed_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    consumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relaciones
    session: Mapped[Optional["ExamSession"]] = relationship(back_populates="access_decisions")
    user: Mapped["User"] = relationship(back_populates="access_decisions")
