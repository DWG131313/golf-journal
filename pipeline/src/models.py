from typing import Dict, List, Optional
from pydantic import BaseModel


class Lesson(BaseModel):
    id: str
    filename: str
    date: str
    duration_seconds: Optional[float] = None
    source_type: str  # "coaching" | "youtube" | "other"
    source_url: Optional[str] = None
    source_metadata: Optional[dict] = None
    processing_status: str = "pending"  # "pending" | "processing" | "completed" | "failed"
    topic_summary: Optional[str] = None
    segment_count: int = 0


class TranscriptWord(BaseModel):
    word: str
    start: float
    end: float
    speaker: Optional[str] = None


class Segment(BaseModel):
    lesson_id: str
    segment_index: int
    start_time: float
    end_time: float
    topic: str
    categories: List[str]
    coach_tips: List[str]
    student_observations: List[str]
    visual_context: str
    summary: str
    frames: List[str]
    transcript: str
    speaker_map: Optional[Dict[str, str]] = None


class Chunk(BaseModel):
    id: str
    lesson_id: str
    segment_index: int
    text: str
    embedding: Optional[List[float]] = None
    start_time: float
    end_time: float
    frames: List[str]


class ProcessingLog(BaseModel):
    lesson_id: str
    stage: str
    tokens_used: int
    timestamp: str
    status: str  # "success" | "error"
    details: Optional[str] = None
