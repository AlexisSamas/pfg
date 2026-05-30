from datetime import datetime
from typing import Optional
from sqlalchemy import ForeignKey, String, DateTime, Float, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base

class ScoringResult(Base):
    __tablename__ = "scoring_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("exam_sessions.id"), unique=True)
    trm_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    d_prime: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stroop_effect_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    flanker_effect_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stroop_error_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    flanker_accuracy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    decision: Mapped[str] = mapped_column(String(50))  # "ACCESO", "ESPERA", "BLOQUEO"
    weakest_metric: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    recommendation_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    # Relaciones
    session: Mapped["ExamSession"] = relationship(back_populates="scoring_result")
