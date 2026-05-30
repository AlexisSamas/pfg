from typing import Optional
from sqlalchemy import ForeignKey, String, BigInteger, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base

class GameEvent(Base):
    __tablename__ = "game_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("exam_sessions.id"))
    game_type: Mapped[str] = mapped_column(String(50))  # "cpt", "stroop", "flanker"
    event_type: Mapped[str] = mapped_column(String(50))  # p. ej., "stimulus_shown", "input_recorded"
    timestamp_us: Mapped[int] = mapped_column(BigInteger)
    reaction_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_correct: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    stimulus_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # "congruent", "incongruent", "X", etc.

    # Relaciones
    session: Mapped["ExamSession"] = relationship(back_populates="events")
