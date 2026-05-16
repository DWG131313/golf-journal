"""Unit tests for process.py — stage dispatch and loop logic.

Uses unittest.mock to avoid loading any heavy models (mlx_whisper,
sentence-transformers) or making real API calls.

process.py does top-level imports of the three stage functions, so we stub
their parent modules *before* importing process.  patch("process.<name>")
then works normally because the name is already on the module object.
"""
from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure sibling modules resolve without installing them as packages.
HERE = Path(__file__).resolve().parent
INGEST = HERE.parent
DB_DIR = INGEST.parent / "db"
sys.path.insert(0, str(DB_DIR))
sys.path.insert(0, str(INGEST))

# ---------------------------------------------------------------------------
# Stub heavy third-party deps so the imports in transcribe/analyze/embed don't
# blow up when process.py pulls them in at module load time.
# ---------------------------------------------------------------------------

def _stub(name: str) -> types.ModuleType:
    m = sys.modules.get(name)
    if m is None:
        m = types.ModuleType(name)
        sys.modules[name] = m
    return m

_stub("mlx_whisper")

_st = _stub("sentence_transformers")
_st.SentenceTransformer = MagicMock  # type: ignore

_an = _stub("anthropic")
_an.Anthropic = MagicMock  # type: ignore

_denv = _stub("dotenv")
_denv.load_dotenv = MagicMock()  # type: ignore

# Stub the three stage modules so `from transcribe import …` etc. in
# process.py succeeds without needing the actual heavy libraries.
for _mod_name in ("transcribe", "analyze", "embed"):
    m = _stub(_mod_name)
    # Add minimal attributes referenced by process.py's top-level imports.
    m.transcribe_and_store = MagicMock()       # type: ignore
    m.analyze_transcript = MagicMock()         # type: ignore
    m.DEFAULT_MODEL = "stub-model"             # type: ignore
    m.embed_video = MagicMock()                # type: ignore

# Now safe to import process.
import process  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_db(status_sequence: list[str]) -> MagicMock:
    """Build a mock Database whose get_video returns rows with cycling statuses."""
    db = MagicMock()
    video_mocks = [MagicMock(id=42, status=s) for s in status_sequence]
    db.get_video.side_effect = video_mocks
    return db


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestStageByStatus(unittest.TestCase):
    def test_all_resumable_statuses_mapped(self):
        self.assertEqual(process.STAGE_BY_STATUS["classified"], "transcribe")
        self.assertEqual(process.STAGE_BY_STATUS["transcribed"], "analyze")
        self.assertEqual(process.STAGE_BY_STATUS["analyzed"], "embed")

    def test_pending_not_in_map(self):
        self.assertNotIn("pending", process.STAGE_BY_STATUS)

    def test_embedded_not_in_map(self):
        self.assertNotIn("embedded", process.STAGE_BY_STATUS)


class TestProcessOne(unittest.TestCase):

    def setUp(self):
        # Reset module-level singletons between tests.
        process._anthropic_client = None
        process._embed_model = None

    def test_already_embedded_returns_done(self):
        db = _make_db(["embedded"])
        status, msg = process.process_one(42, db)
        self.assertEqual(status, "embedded")
        self.assertEqual(msg, "done")

    def test_pending_skipped_with_warning(self):
        db = _make_db(["pending"])
        with self.assertWarns(UserWarning):
            status, msg = process.process_one(42, db)
        self.assertEqual(status, "pending")
        self.assertIn("unsupported", msg)

    def test_unknown_status_returns_unsupported(self):
        db = _make_db(["wacky_status"])
        status, msg = process.process_one(42, db)
        self.assertEqual(status, "wacky_status")
        self.assertIn("unsupported", msg)

    def test_video_not_found(self):
        db = MagicMock()
        db.get_video.return_value = None
        status, msg = process.process_one(99, db)
        self.assertEqual(status, "unknown")
        self.assertIn("error", msg)

    def test_transcribe_dispatched_for_classified(self):
        """A classified video should call transcribe_and_store then advance."""
        # Status sequence: classified → transcribed → analyzed → embedded
        db = _make_db(["classified", "transcribed", "analyzed", "embedded"])

        with (
            patch("process.transcribe_and_store") as mock_t,
            patch("process.analyze_transcript") as mock_a,
            patch("process._get_embed_model", return_value=MagicMock()),
            patch("process.embed_video") as mock_e,
        ):
            status, msg = process.process_one(42, db)

        mock_t.assert_called_once_with(42, db)
        mock_a.assert_called_once()
        mock_e.assert_called_once()
        self.assertEqual(status, "embedded")
        self.assertEqual(msg, "done")

    def test_analyze_dispatched_for_transcribed(self):
        db = _make_db(["transcribed", "analyzed", "embedded"])

        with (
            patch("process.analyze_transcript") as mock_a,
            patch("process._get_embed_model", return_value=MagicMock()),
            patch("process.embed_video") as mock_e,
        ):
            status, msg = process.process_one(42, db)

        mock_a.assert_called_once()
        mock_e.assert_called_once()
        self.assertEqual(status, "embedded")

    def test_embed_dispatched_for_analyzed(self):
        db = _make_db(["analyzed", "embedded"])

        with (
            patch("process._get_embed_model", return_value=MagicMock()),
            patch("process.embed_video") as mock_e,
        ):
            status, msg = process.process_one(42, db)

        mock_e.assert_called_once()
        self.assertEqual(status, "embedded")

    def test_exception_caught_returns_error(self):
        db = _make_db(["analyzed"])

        with (
            patch("process._get_embed_model", return_value=MagicMock()),
            patch("process.embed_video", side_effect=RuntimeError("gpu exploded")),
        ):
            status, msg = process.process_one(42, db)

        self.assertEqual(status, "analyzed")
        self.assertIn("error", msg)
        self.assertIn("gpu exploded", msg)

    def test_loop_cap_prevents_infinite_cycle(self):
        """If status never advances, the loop should cap at 5 iterations."""
        db = MagicMock()
        # Always returns 'classified' — stage ran but status never changed.
        db.get_video.return_value = MagicMock(id=42, status="classified")

        with patch("process.transcribe_and_store"):
            status, msg = process.process_one(42, db)

        self.assertIn("loop cap", msg)


class TestProcessAll(unittest.TestCase):

    def setUp(self):
        process._anthropic_client = None
        process._embed_model = None

    def test_empty_db_returns_empty_tally(self):
        db = MagicMock()
        db.list_videos.return_value = []
        tally = process.process_all(db)
        self.assertEqual(tally, {})

    def test_dry_run_does_not_call_process_one(self):
        db = MagicMock()
        video = MagicMock(id=1, status="analyzed")
        db.list_videos.side_effect = lambda status=None: (
            [video] if status == "analyzed" else []
        )

        with patch("process.process_one") as mock_proc:
            tally = process.process_all(db, dry_run=True)

        mock_proc.assert_not_called()
        # In dry-run mode we tally by current status.
        self.assertIn("analyzed", tally)

    def test_limit_caps_batch(self):
        db = MagicMock()
        videos = [MagicMock(id=i, status="analyzed") for i in range(1, 6)]
        db.list_videos.side_effect = lambda status=None: (
            videos if status == "analyzed" else []
        )

        with patch("process.process_one", return_value=("embedded", "done")) as mock_proc:
            process.process_all(db, limit=2)

        self.assertEqual(mock_proc.call_count, 2)

    def test_errors_tallied_separately(self):
        db = MagicMock()
        video = MagicMock(id=7, status="analyzed")
        db.list_videos.side_effect = lambda status=None: (
            [video] if status == "analyzed" else []
        )

        with patch("process.process_one", return_value=("analyzed", "error: boom")):
            tally = process.process_all(db)

        self.assertEqual(tally.get("errors", 0), 1)
        self.assertNotIn("analyzed", tally)


if __name__ == "__main__":
    unittest.main()
