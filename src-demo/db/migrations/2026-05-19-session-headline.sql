-- Add session.title for LLM-synthesized headline.
--
-- Previously the dashboard's library row "title" fell back to the first
-- segment of the first video in the session — fine for single-video sessions,
-- misleading for multi-video coaching days where the first segment captures
-- only one topic. summarize_session.py now writes both `title` (concise
-- editorial headline) and `summary` (1-2 sentence recap) once all videos
-- in a session are embedded.

ALTER TABLE sessions ADD COLUMN title TEXT;
