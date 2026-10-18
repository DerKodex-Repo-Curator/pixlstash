"""Add ``picture_pending_person``, the people a picture's faces are owed to.

A run loading the LoRAs of several people names all of them, and face
extraction matches the picture's faces to them by likeness. Until it runs the
people wait here, one row each; ``picture.pending_character_id`` holds one.

Schema-only and additive.

Revision ID: 0132_add_picture_pending_person
Revises: 0131_recompute_smart_score_for_malformed_eyes
Create Date: 2026-10-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0132_add_picture_pending_person"
down_revision: Union[str, None] = "0131_recompute_smart_score_for_malformed_eyes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

__all__ = ["revision", "down_revision", "branch_labels", "depends_on"]


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = inspector.get_table_names()
    if "picture_pending_person" in tables or "picture" not in tables:
        # Partial databases used by migration tests carry no picture table.
        return
    op.create_table(
        "picture_pending_person",
        sa.Column(
            "picture_id",
            sa.Integer(),
            sa.ForeignKey("picture.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "character_id",
            sa.Integer(),
            sa.ForeignKey("character.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_index(
        "ix_picture_pending_person_picture_id",
        "picture_pending_person",
        ["picture_id"],
    )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "picture_pending_person" in inspector.get_table_names():
        op.drop_table("picture_pending_person")
