from pipeline.src.cost import CostTracker, estimate_tokens


def test_estimate_tokens():
    text = "a" * 4000
    frames_count = 5
    estimate = estimate_tokens(text, frames_count)
    assert estimate > 0
    assert estimate > 1000


def test_cost_tracker_within_budget():
    tracker = CostTracker(max_tokens_per_video=100000)
    tracker.add(5000)
    tracker.add(10000)
    assert tracker.total == 15000
    assert tracker.is_within_budget()


def test_cost_tracker_exceeds_budget():
    tracker = CostTracker(max_tokens_per_video=10000)
    tracker.add(8000)
    tracker.add(5000)
    assert tracker.total == 13000
    assert not tracker.is_within_budget()


def test_cost_tracker_no_budget():
    tracker = CostTracker(max_tokens_per_video=None)
    tracker.add(999999)
    assert tracker.is_within_budget()


def test_dry_run_estimate():
    transcript_text = "word " * 500
    frame_count = 60
    estimate = estimate_tokens(transcript_text, frame_count)
    assert isinstance(estimate, int)
    assert estimate > 0
