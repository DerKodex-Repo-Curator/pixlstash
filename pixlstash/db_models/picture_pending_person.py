"""The people a picture is of, owed to its faces once they are read.

A run that loads the LoRAs of several people makes pictures of all of them,
but a fresh output has no faces yet, and ``Picture.pending_character_id`` holds
one person. A row here is one of those people; face extraction matches the
picture's faces to its rows by likeness
(:func:`pixlstash.scoring.match_faces_to_characters`) and deletes them.
"""

from sqlmodel import Column, Field, ForeignKey, Integer, SQLModel


class PicturePendingPerson(SQLModel, table=True):
    """One person a picture's faces are still to be matched to."""

    __tablename__ = "picture_pending_person"

    picture_id: int = Field(
        default=None,
        sa_column=Column(
            Integer,
            ForeignKey("picture.id", ondelete="CASCADE"),
            primary_key=True,
            index=True,
        ),
    )
    character_id: int = Field(
        default=None,
        sa_column=Column(
            Integer,
            ForeignKey("character.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
