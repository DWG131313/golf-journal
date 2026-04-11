def test_lesson_model_defaults():
    from pipeline.src.models import Lesson

    lesson = Lesson(
        id="2025-05-08-lesson-1",
        filename="test.mov",
        date="2025-05-08",
        source_type="coaching",
    )
    assert lesson.processing_status == "pending"
    assert lesson.segment_count == 0
    assert lesson.source_url is None


def test_segment_model():
    from pipeline.src.models import Segment

    segment = Segment(
        lesson_id="2025-05-08-lesson-1",
        segment_index=0,
        start_time=0.0,
        end_time=30.0,
        topic="Driver setup",
        categories=["driver", "setup"],
        coach_tips=["Widen your stance"],
        student_observations=["I feel cramped"],
        visual_context="Toptracer shows narrow stance",
        summary="Coach adjusts stance width for driver",
        frames=["frame_0.0.png"],
        transcript="Coach: Let's widen that stance...",
    )
    assert segment.categories == ["driver", "setup"]
    assert len(segment.coach_tips) == 1
