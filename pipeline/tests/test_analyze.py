import json
from unittest.mock import patch, MagicMock
from pipeline.src.analyze import build_analysis_prompt, parse_analysis_response, analyze_batch
from pipeline.src.cost import CostTracker


def _force_api_backend(monkeypatch):
    """Force the api backend regardless of the dev's local env."""
    monkeypatch.setenv("GOLF_COACH_BACKEND", "api")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")


def test_build_analysis_prompt_coaching():
    prompt = build_analysis_prompt(
        transcript_chunk="Coach: Keep your head down",
        source_type="coaching",
        start_time=0.0,
        end_time=30.0,
    )
    assert "coaching session" in prompt.lower()
    assert "Keep your head down" in prompt


def test_build_analysis_prompt_youtube():
    prompt = build_analysis_prompt(
        transcript_chunk="Today we'll cover the driver swing",
        source_type="youtube",
        start_time=0.0,
        end_time=60.0,
        source_metadata={"title": "Driver Tips", "channel": "Golf Digest"},
    )
    assert "Driver Tips" in prompt
    assert "Golf Digest" in prompt


def test_parse_analysis_response():
    raw = json.dumps({"topic": "grip", "summary": "Discusses proper grip technique"})
    result = parse_analysis_response(raw)
    assert result["topic"] == "grip"
    assert result["summary"] == "Discusses proper grip technique"


def test_parse_analysis_response_with_markdown():
    raw = '```json\n{"topic": "stance", "summary": "Covers stance basics"}\n```'
    result = parse_analysis_response(raw)
    assert result["topic"] == "stance"
    assert result["summary"] == "Covers stance basics"


@patch("pipeline.src.analyze.anthropic.Anthropic")
def test_analyze_batch(mock_anthropic_class, tmp_data_dir, monkeypatch):
    _force_api_backend(monkeypatch)
    # Setup mock client and response
    mock_client = mock_anthropic_class.return_value
    mock_response = MagicMock()
    mock_response.content = [MagicMock()]
    mock_response.content[0].text = json.dumps({
        "topic": "backswing",
        "categories": ["swing mechanics"],
        "coach_tips": ["Keep elbow tucked"],
        "student_observations": ["Good rotation"],
        "visual_context": "Outdoor range",
        "summary": "Working on backswing mechanics",
    })
    mock_response.usage.input_tokens = 5000
    mock_response.usage.output_tokens = 500
    mock_client.messages.create.return_value = mock_response

    # Create a fake PNG file
    frame_dir = tmp_data_dir / "frames"
    frame_path = frame_dir / "frame_00.png"
    frame_path.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)

    tracker = CostTracker(max_tokens_per_video=100000)

    result = analyze_batch(
        transcript_chunk="Coach: Keep your elbow tucked on the backswing",
        frame_paths=[str(frame_path)],
        source_type="coaching",
        start_time=0.0,
        end_time=30.0,
        cost_tracker=tracker,
    )

    assert result["topic"] == "backswing"
    assert result["summary"] == "Working on backswing mechanics"
    assert tracker.total == 5500
    mock_client.messages.create.assert_called_once()
