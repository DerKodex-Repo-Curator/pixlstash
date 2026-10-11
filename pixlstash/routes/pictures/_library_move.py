"""Move pictures and videos from the active library into another one.

A library is a folder with its own database, and the server has one open. So a
move is a copy into the other library followed by the ordinary soft delete
here, in that order: the picture is committed there before it is touched here,
and what happens here is the same undoable move to the Scrapheap that Delete
does. Nothing in this module removes a file.

The other library is opened beside the active one, as a switch opens its
candidate, but with no workers and without being published
(:meth:`LibrarySwitchService.open_other_library`). What it could not compute
while closed - embeddings, faces, scores - its own finders pick up the next
time it is the active library.

**What travels:** the file, its tags, score, description and creation date.
**What does not:** people, sets, projects and stacks. Their ids name different
things in the other library, so they are left behind rather than guessed at.
"""

import os
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from pixlstash.auth import token_covers_library
from pixlstash.db_models import TAG_PENDING_SENTINEL, Picture, Tag
from pixlstash.db_models.tag import is_tag_sentinel
from pixlstash.hub.registry import LibraryError, LibraryNotFoundError
from pixlstash.pixl_logging import get_logger
from pixlstash.services.set_lock_service import locked_picture_ids
from pixlstash.utils.image_processing.image_utils import ImageUtils

from ._crud import BULK_DELETE_MAX_IDS, scrapheap_pictures
from ._helpers import _create_picture_imports

logger = get_logger(__name__)


class MoveToLibraryRequest(BaseModel):
    picture_ids: list[int] = Field(min_length=1, max_length=BULK_DELETE_MAX_IDS)
    # The library's stable identity, as `GET /libraries` lists it.
    library_uuid: str


class MoveToLibraryResponse(BaseModel):
    status: str
    library_name: str
    # Pictures that left this library: they are in the other one now, and in
    # this library's Scrapheap.
    moved_count: int
    # Of those, how many the other library already held, byte for byte.
    already_there_count: int = 0
    # Left here because a locked set freezes them.
    skipped_locked: list[int] = []
    # Left here because the other library has the same file in its Scrapheap,
    # and restoring it there is that library's decision.
    skipped_scrapheaped: list[int] = []
    # Left here because the file could not be read or written.
    failed: list[int] = []


def _refuse_token_pinned_elsewhere(request: Request, library_uuid: str) -> None:
    """Refuse a credential that the library pin keeps out of *library_uuid*.

    The gate pins a token to the ACTIVE library; this route also writes into a
    second one, which the gate cannot see because it is named in the body. Same
    predicate, asked of the target, so a token good for this library alone
    cannot put pictures into another.
    """
    token = getattr(request.state, "matched_token", None)
    if token is not None:
        allowed = token_covers_library(token, library_uuid)
    else:
        # A password session follows the owner anywhere; one created from a
        # token inherits that token's pin.
        session_library = getattr(request.state, "session_library_uuid", None)
        allowed = session_library is None or session_library == library_uuid
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail=(
                "This token belongs to one library and cannot move pictures "
                "into another. Let it cover every library under API Tokens in "
                "Settings, or sign in."
            ),
        )


def _read_source(session: Session, ids: list[int]):
    """The live pictures among *ids*, their tags, and which a locked set freezes."""
    pictures = {
        pic.id: pic
        for pic in session.exec(
            select(Picture).where(Picture.id.in_(ids), Picture.deleted.is_(False))
        ).all()
    }
    tags: dict[int, list[str]] = {}
    for picture_id, tag in session.exec(
        select(Tag.picture_id, Tag.tag).where(Tag.picture_id.in_(list(pictures)))
    ).all():
        if tag and not is_tag_sentinel(tag):
            tags.setdefault(picture_id, []).append(tag)
    rows = [
        SimpleNamespace(
            id=pic.id,
            file_path=pic.file_path,
            original_file_name=pic.original_file_name,
            score=pic.score,
            description=pic.description,
            created_at=pic.created_at,
            tags=sorted(tags.get(pic.id, [])),
        )
        for pic in (pictures[i] for i in dict.fromkeys(ids) if i in pictures)
    ]
    return rows, locked_picture_ids(session, list(pictures))


def _copy_into(target, source_root: str, row) -> str:
    """Put one picture into *target*. Returns ``new``, ``duplicate`` or ``scrapheaped``."""
    source_path = ImageUtils.resolve_picture_path(source_root, row.file_path)
    with open(source_path, "rb") as handle:
        data = handle.read()
    ext = os.path.splitext(row.file_path)[1].lower()
    fingerprints, existing, scrapheaped, created = _create_picture_imports(
        SimpleNamespace(vault=target),
        [(data, ext, row.original_file_name)],
        target.image_root,
    )
    fingerprint = fingerprints[0]
    if fingerprint in existing:
        return "duplicate"
    if fingerprint in scrapheaped:
        return "scrapheaped"

    picture = created[fingerprint]
    # The file was just written, so anything derived from it would say "now".
    picture.created_at = row.created_at or picture.created_at
    picture.imported_at = datetime.now(timezone.utc)
    picture.score = row.score
    picture.description = row.description

    def persist(session: Session):
        session.add(picture)
        session.flush()
        # No tags of its own: leave the marker the tagger looks for, as every
        # other import does.
        for tag in row.tags or [TAG_PENDING_SENTINEL]:
            session.add(Tag(tag=tag, picture_id=picture.id))
        session.commit()

    target.db.run_task(persist)
    return "new"


def register_routes(router, server):
    @router.post(
        "/pictures/move-to-library",
        summary="Move pictures to another library",
        description=(
            "Copies the named pictures and videos into another attached "
            "library, then moves them to this library's Scrapheap - one "
            "`pictures.scrapheap.move` operation, so one undo brings them back "
            "here. Tags, score, description and creation date travel with the "
            "file; people, sets, projects and stacks do not. A file the other "
            "library already holds is not copied again, and one it holds in its "
            "Scrapheap is left where it is in both."
        ),
        response_model=MoveToLibraryResponse,
    )
    def move_pictures_to_library(request: Request, payload: MoveToLibraryRequest):
        _refuse_token_pinned_elsewhere(request, payload.library_uuid)
        source = server.vault
        rows, locked = source.db.run_immediate_read_task(
            _read_source, payload.picture_ids
        )

        outcomes: dict[int, str] = {}
        try:
            # ponytail: one synchronous request, one file in memory at a time.
            # A selection of long videos holds the connection for as long as
            # the copy takes; make it a background task with progress, like the
            # import, when that is felt.
            with server.library_switch.open_other_library(payload.library_uuid) as (
                library,
                target,
            ):
                for row in rows:
                    if row.id in locked:
                        continue
                    try:
                        outcomes[row.id] = _copy_into(target, source.image_root, row)
                    except Exception:
                        # Left where it is: nothing here is touched until the
                        # copy is committed there.
                        logger.exception(
                            "Could not move picture %s (%s) to library %s",
                            row.id,
                            row.file_path,
                            library.name,
                        )
                        outcomes[row.id] = "failed"
        except LibraryNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except LibraryError as exc:
            # The library could not be opened, or a switch or another move is
            # running. Nothing was copied and nothing here was touched.
            raise HTTPException(status_code=409, detail=str(exc)) from exc

        arrived = [pid for pid, how in outcomes.items() if how in ("new", "duplicate")]
        moved, newly_locked = (
            scrapheap_pictures(server, request, arrived) if arrived else ([], [])
        )
        logger.info(
            "Moved %d picture(s) to library %s: %s",
            len(moved),
            library.name,
            {how: list(outcomes.values()).count(how) for how in set(outcomes.values())},
        )
        return MoveToLibraryResponse(
            status="success",
            library_name=library.name,
            moved_count=len(moved),
            already_there_count=sum(
                1 for pid in moved if outcomes.get(pid) == "duplicate"
            ),
            skipped_locked=sorted(set(locked) | set(newly_locked)),
            skipped_scrapheaped=[
                pid for pid, how in outcomes.items() if how == "scrapheaped"
            ],
            failed=[pid for pid, how in outcomes.items() if how == "failed"],
        )
