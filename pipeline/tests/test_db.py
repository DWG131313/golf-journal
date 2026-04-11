import json
from pipeline.src.db import Database
from pipeline.src.models import Lesson, Segment, Chunk, ProcessingLog


def test_init_creates_tables(tmp_path):
    db_path = str(tmp_path / "test.db")
    db = Database(db_path)
    db.close()


def test_insert_and_get_lesson(tmp_path):
    db_path = str(tmp_path / "test.db")
    db = Database(db_path)
    lesson = Lesson(
        id="lesson-1",
        filename="test.mov",
        date="2025-05-08",
        source_type="coaching",
        duration_seconds=300.0,
    )
    db.insert_lesson(lesson)
    result = db.get_lesson("lesson-1")
    assert result is not None
    assert result.id == "lesson-1"
    assert result.source_type == "coaching"
    assert result.duration_seconds == 300.0
    db.close()


def test_list_lessons(tmp_path):
    db_path = str(tmp_path / "test.db")
    db = Database(db_path)
    for i in range(3):
        db.insert_lesson(Lesson(
            id=f"lesson-{i}",
            filename=f"test{i}.mov",
            date="2025-05-08",
            source_type="coaching",
        ))
    lessons = db.list_lessons()
    assert len(lessons) == 3
    db.close()


def test_insert_and_get_segments(tmp_path):
    db_path = str(tmp_path / "test.db")
    db = Database(db_path)
    db.insert_lesson(Lesson(
        id="lesson-1", filename="test.mov", date="2025-05-08", source_type="coaching",
    ))
    segment = Segment(
        lesson_id="lesson-1",
        segment_index=0,
        start_time=0.0,
        end_time=30.0,
        topic="Driver setup",
        categories=["driver", "setup"],
        coach_tips=["Widen stance"],
        student_observations=["Feels cramped"],
        visual_context="Narrow stance on Toptracer",
        summary="Stance adjustment",
        frames=["frame_0.png"],
        transcript="Coach: Let's widen that stance...",
    )
    db.insert_segment(segment)
    segments = db.get_segments("lesson-1")
    assert len(segments) == 1
    assert segments[0].topic == "Driver setup"
    assert segments[0].categories == ["driver", "setup"]
    db.close()


def test_update_lesson_status(tmp_path):
    db_path = str(tmp_path / "test.db")
    db = Database(db_path)
    db.insert_lesson(Lesson(
        id="lesson-1", filename="test.mov", date="2025-05-08", source_type="coaching",
    ))
    db.update_lesson_status("lesson-1", "completed")
    lesson = db.get_lesson("lesson-1")
    assert lesson.processing_status == "completed"
    db.close()


def test_insert_processing_log(tmp_path):
    db_path = str(tmp_path / "test.db")
    db = Database(db_path)
    log = ProcessingLog(
        lesson_id="lesson-1",
        stage="analyze",
        tokens_used=15000,
        timestamp="2025-05-08T12:00:00",
        status="success",
    )
    db.insert_processing_log(log)
    logs = db.get_processing_logs("lesson-1")
    assert len(logs) == 1
    assert logs[0].tokens_used == 15000
    db.close()
