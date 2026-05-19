"""Typed row models for the Golf Coach demo schema.

One dataclass per table. Field names mirror SQL column names.
Required fields come first; optional fields (DB defaults or NULL)
follow. `id` is always optional because the DB assigns it.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, date
from typing import Optional


@dataclass
class Video:
    source: str                                 # 'trackman' | 'local' | 'upload'
    filename: str
    file_path: str
    id: Optional[int] = None
    source_ref: Optional[str] = None
    file_hash: Optional[str] = None
    duration_seconds: Optional[float] = None
    speech_seconds: Optional[float] = None
    recorded_at: Optional[datetime] = None
    ingested_at: Optional[datetime] = None
    status: str = "pending"
    thumbnail_path: Optional[str] = None
    notes: Optional[str] = None


@dataclass
class Coach:
    name: str
    id: Optional[int] = None
    facility: Optional[str] = None


@dataclass
class Session:
    date: date
    id: Optional[int] = None
    coach_id: Optional[int] = None
    facility: Optional[str] = None
    title: Optional[str] = None
    summary: Optional[str] = None
    created_at: Optional[datetime] = None


@dataclass
class SessionVideo:
    session_id: int
    video_id: int
    sequence: Optional[int] = None


@dataclass
class Transcript:
    video_id: int
    full_text: str
    id: Optional[int] = None
    segments_json: Optional[str] = None
    speakers_json: Optional[str] = None
    language: str = "en"
    word_count: Optional[int] = None
    created_at: Optional[datetime] = None


@dataclass
class Segment:
    video_id: int
    start_seconds: float
    end_seconds: float
    id: Optional[int] = None
    title: Optional[str] = None
    summary: Optional[str] = None
    key_points_json: Optional[str] = None
    transcript_text: Optional[str] = None
    dominant_speaker: Optional[str] = None       # 'coach' | 'student'
    created_at: Optional[datetime] = None


@dataclass
class Topic:
    name: str
    id: Optional[int] = None
    category: Optional[str] = None              # 'mechanics' | 'mental' | 'short-game' | 'putting'
    subcategory: Optional[str] = None           # 'Wrist' | 'Hip' | 'Club Face' | etc. — manual grouping label


@dataclass
class Drill:
    name: str
    id: Optional[int] = None
    description: Optional[str] = None
    category: Optional[str] = None              # 'tempo' | 'sequencing' | 'face control'


@dataclass
class TopicMention:
    video_id: int
    topic_id: int
    start_seconds: float
    id: Optional[int] = None
    segment_id: Optional[int] = None
    end_seconds: Optional[float] = None
    quote: Optional[str] = None
    speaker: Optional[str] = None                # 'coach' | 'student'


@dataclass
class DrillMention:
    video_id: int
    drill_id: int
    start_seconds: float
    id: Optional[int] = None
    segment_id: Optional[int] = None
    end_seconds: Optional[float] = None
    quote: Optional[str] = None
    speaker: Optional[str] = None                # 'coach' | 'student'


@dataclass
class Chunk:
    video_id: int
    chunk_text: str
    chunk_index: int
    embedding_model: str
    id: Optional[int] = None
    segment_id: Optional[int] = None
    created_at: Optional[datetime] = None


@dataclass
class ProcessingLog:
    stage: str                                  # 'classify' | 'transcribe' | 'analyze' | 'embed'
    status: str                                 # 'started' | 'success' | 'failed' | 'skipped'
    id: Optional[int] = None
    video_id: Optional[int] = None
    duration_ms: Optional[int] = None
    cost_cents: Optional[float] = None
    error: Optional[str] = None
    created_at: Optional[datetime] = None


@dataclass
class SkippedVideo:
    filename: str
    original_path: str
    reason: str                                 # 'silent_swing_clip' | 'too_short' | 'duplicate' | 'corrupt'
    id: Optional[int] = None
    moved_to_path: Optional[str] = None
    duration_seconds: Optional[float] = None
    speech_seconds: Optional[float] = None
    skipped_at: Optional[datetime] = None
