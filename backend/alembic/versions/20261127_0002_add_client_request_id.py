"""Add client-generated idempotency key to transcription records.

Revision ID: 20261127_0002
Revises: 20261127_0001
Create Date: 2026-11-27
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261127_0002"
down_revision: str | None = "20261127_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "transcriptions",
        sa.Column("client_request_id", sa.Uuid(), nullable=True),
    )
    op.create_unique_constraint(
        "uq_transcriptions_client_request",
        "transcriptions",
        ["client_id", "client_request_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_transcriptions_client_request",
        "transcriptions",
        type_="unique",
    )
    op.drop_column("transcriptions", "client_request_id")
