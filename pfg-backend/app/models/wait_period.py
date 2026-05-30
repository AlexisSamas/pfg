from datetime import datetime
from typing import Optional
from sqlalchemy import ForeignKey, String, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base

class WaitPeriod(Base):
    __tablename__ = "wait_periods"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    context_id: Mapped[str] = mapped_column(String(255), index=True)
    attempt_number: Mapped[int] = mapped_column(Integer)
    wait_until: Mapped[datetime] = mapped_column(DateTime)
    reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    recommendation_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Relaciones
    user: Mapped["User"] = relationship(back_populates="wait_periods")
