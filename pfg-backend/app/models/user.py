from datetime import datetime
from typing import List
from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50), default="student")  # "student", "instructor"
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    # Relaciones
    sessions: Mapped[List["ExamSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    wait_periods: Mapped[List["WaitPeriod"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    access_decisions: Mapped[List["AccessDecision"]] = relationship(back_populates="user", cascade="all, delete-orphan")
