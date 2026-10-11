"""Cleanup failures must not replace a target import's persistence failure."""

from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from pixlstash.routes.pictures import _library_move


def test_thumbnail_cleanup_preserves_original_persistence_error(tmp_path, monkeypatch):
    source_root = tmp_path / "source"
    source_root.mkdir()
    (source_root / "source.png").write_bytes(b"source picture")
    target_root = tmp_path / "target"
    target_root.mkdir()
    copied_path = target_root / "copy.png"
    copied_path.write_bytes(b"copied picture")
    picture = SimpleNamespace(file_path="copy.png", created_at=None)
    row = SimpleNamespace(
        id=7,
        file_path="source.png",
        original_file_name="original.png",
        created_at=None,
        score=3,
        description="A picture",
        tags=[],
    )
    persist_error = RuntimeError("target persistence failed")
    target = SimpleNamespace(
        image_root=str(target_root),
        db=SimpleNamespace(run_task=Mock(side_effect=persist_error)),
    )
    monkeypatch.setattr(
        _library_move,
        "_create_picture_imports",
        Mock(return_value=(["fingerprint"], {}, {}, {"fingerprint": picture})),
    )
    cleanup = Mock(side_effect=OSError("thumbnail could not be removed"))
    monkeypatch.setattr(_library_move.ImageUtils, "remove_thumbnail", cleanup)
    cleanup_log = Mock()
    monkeypatch.setattr(_library_move.logger, "exception", cleanup_log)

    with pytest.raises(RuntimeError) as caught:
        _library_move._copy_into(target, str(source_root), row)

    assert caught.value is persist_error
    assert not copied_path.exists()
    cleanup.assert_called_once_with(str(target_root), "copy.png")
    cleanup_log.assert_called_once_with(
        "Could not remove orphan thumbnail for %s after failed move of picture %s",
        "copy.png",
        7,
    )
