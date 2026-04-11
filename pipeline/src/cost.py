TOKENS_PER_IMAGE = 1600
CHARS_PER_TOKEN = 4


def estimate_tokens(text: str, frame_count: int) -> int:
    text_tokens = len(text) // CHARS_PER_TOKEN
    image_tokens = frame_count * TOKENS_PER_IMAGE
    overhead = int((text_tokens + image_tokens) * 0.2)
    return text_tokens + image_tokens + overhead


class CostTracker:
    def __init__(self, max_tokens_per_video=None):
        self.max_tokens_per_video = max_tokens_per_video
        self.total = 0
        self.entries = []

    def add(self, tokens: int, stage: str = "", details: str = ""):
        self.total += tokens
        self.entries.append({
            "tokens": tokens,
            "stage": stage,
            "details": details,
            "running_total": self.total,
        })

    def is_within_budget(self) -> bool:
        if self.max_tokens_per_video is None:
            return True
        return self.total <= self.max_tokens_per_video

    def remaining(self):
        if self.max_tokens_per_video is None:
            return None
        return max(0, self.max_tokens_per_video - self.total)

    def summary(self) -> str:
        budget_str = f"/ {self.max_tokens_per_video:,}" if self.max_tokens_per_video else "(no limit)"
        return f"Tokens used: {self.total:,} {budget_str}"
