"""initial schema

Revision ID: 20260602_0001
Revises:
Create Date: 2026-06-02 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260602_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _has_index(table_name: str, index_name: str) -> bool:
    indexes = sa.inspect(op.get_bind()).get_indexes(table_name)
    return any(index["name"] == index_name for index in indexes)


def _create_index_if_missing(
    index_name: str,
    table_name: str,
    columns: list[str],
    unique: bool = False,
) -> None:
    if _has_table(table_name) and not _has_index(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def upgrade() -> None:
    if not _has_table("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("username", sa.String(length=100), nullable=False),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("hashed_password", sa.String(length=255), nullable=False),
            sa.Column("role", sa.String(length=50), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
    _create_index_if_missing("ix_users_email", "users", ["email"], unique=True)
    _create_index_if_missing("ix_users_username", "users", ["username"], unique=True)

    if not _has_table("exam_sessions"):
        op.create_table(
            "exam_sessions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("context_id", sa.String(length=255), nullable=False),
            sa.Column("attempt_number", sa.Integer(), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(length=50), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    _create_index_if_missing(
        "ix_exam_sessions_context_id",
        "exam_sessions",
        ["context_id"],
    )

    if not _has_table("wait_periods"):
        op.create_table(
            "wait_periods",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("context_id", sa.String(length=255), nullable=False),
            sa.Column("attempt_number", sa.Integer(), nullable=False),
            sa.Column("wait_until", sa.DateTime(), nullable=False),
            sa.Column("reason", sa.String(length=255), nullable=True),
            sa.Column("recommendation_key", sa.String(length=100), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    _create_index_if_missing(
        "ix_wait_periods_context_id",
        "wait_periods",
        ["context_id"],
    )

    if not _has_table("access_decisions"):
        op.create_table(
            "access_decisions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("session_id", sa.Integer(), nullable=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("context_id", sa.String(length=255), nullable=False),
            sa.Column("decision", sa.String(length=50), nullable=False),
            sa.Column("score", sa.Float(), nullable=True),
            sa.Column("decided_at", sa.DateTime(), nullable=False),
            sa.Column("consumed_by", sa.String(length=100), nullable=True),
            sa.Column("consumed_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["session_id"], ["exam_sessions.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    _create_index_if_missing(
        "ix_access_decisions_context_id",
        "access_decisions",
        ["context_id"],
    )

    if not _has_table("game_events"):
        op.create_table(
            "game_events",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("session_id", sa.Integer(), nullable=False),
            sa.Column("game_type", sa.String(length=50), nullable=False),
            sa.Column("event_type", sa.String(length=50), nullable=False),
            sa.Column("timestamp_us", sa.BigInteger(), nullable=False),
            sa.Column("reaction_time_ms", sa.Integer(), nullable=True),
            sa.Column("is_correct", sa.Boolean(), nullable=True),
            sa.Column("stimulus_type", sa.String(length=50), nullable=True),
            sa.ForeignKeyConstraint(["session_id"], ["exam_sessions.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _has_table("scoring_results"):
        op.create_table(
            "scoring_results",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("session_id", sa.Integer(), nullable=False),
            sa.Column("trm_ms", sa.Float(), nullable=True),
            sa.Column("d_prime", sa.Float(), nullable=True),
            sa.Column("stroop_effect_ms", sa.Float(), nullable=True),
            sa.Column("flanker_effect_ms", sa.Float(), nullable=True),
            sa.Column("stroop_error_rate", sa.Float(), nullable=True),
            sa.Column("flanker_accuracy", sa.Float(), nullable=True),
            sa.Column("score", sa.Float(), nullable=True),
            sa.Column("decision", sa.String(length=50), nullable=False),
            sa.Column("weakest_metric", sa.String(length=100), nullable=True),
            sa.Column("recommendation_key", sa.String(length=100), nullable=True),
            sa.Column("computed_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["session_id"], ["exam_sessions.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("session_id"),
        )


def downgrade() -> None:
    if _has_table("scoring_results"):
        op.drop_table("scoring_results")
    if _has_table("game_events"):
        op.drop_table("game_events")
    if _has_table("access_decisions"):
        op.drop_table("access_decisions")
    if _has_table("wait_periods"):
        op.drop_table("wait_periods")
    if _has_table("exam_sessions"):
        op.drop_table("exam_sessions")
    if _has_table("users"):
        op.drop_table("users")
