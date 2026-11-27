"""Add persistent per-IP rate limit buckets."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261127_0003"
down_revision: str | None = "20261127_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rate_limit_buckets",
        sa.Column("ip_hash", sa.String(length=64), nullable=False),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("request_count", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "request_count >= 1",
            name="ck_rate_limit_count_positive",
        ),
        sa.PrimaryKeyConstraint("ip_hash"),
    )


def downgrade() -> None:
    op.drop_table("rate_limit_buckets")
