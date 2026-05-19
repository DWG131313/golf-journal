-- ----------------------------------------------------------------------
-- Topic taxonomy cleanup — 2026-05-18
--
-- The LLM-extracted topic names accumulated duplicates: case variants
-- ("Club Path" vs "Club path"), trailing-qualifier variants ("Setup",
-- "Setup / Address", "Setup / Ball Position"), and synonym clusters
-- ("Hip-Shoulder Disassociation" = "Hip-Shoulder Separation").
--
-- This migration repoints `topic_mentions` from each alias topic to its
-- canonical topic, then deletes the alias rows.
--
-- Before:  119 topics, 191 mentions
-- After:    92 topics, 191 mentions  (-27 dupes)
--
-- Idempotent: re-running is a no-op once aliases are gone (the UPDATE
-- and DELETE filter by names that no longer exist).
-- ----------------------------------------------------------------------

BEGIN;

CREATE TEMP TABLE alias_map(canonical TEXT, alias TEXT);
INSERT INTO alias_map VALUES
  -- Pure case dupes
  ('Club Path', 'Club path'),
  ('Face Angle', 'Face angle'),
  ('Shaft Lean', 'Shaft lean'),
  ('Spine Angle', 'Spine angle'),
  ('Over-the-Top', 'Over-the-top'),
  ('Swing Plane', 'Swing plane'),
  ('Low Point', 'Low point'),
  -- Punctuation / hyphenation variants
  ('Face to Path', 'Face-to-Path'),
  ('Clubhead Speed', 'Club Head Speed'),
  -- Trailing-qualifier variants ("Setup / Address" → "Setup")
  ('Setup', 'Setup / Address'),
  ('Setup', 'Setup / address position'),
  ('Setup', 'Setup / Ball Position'),
  ('Strike Location', 'Strike location (heel/shank)'),
  ('Strike Location', 'Strike location (high face)'),
  ('Weight Shift', 'Weight Shift / Lateral Load'),
  ('Weight Shift', 'Weight shift / lateral movement'),
  ('Head Position', 'Head Position / Stability'),
  ('Ground Force', 'Ground Force / Pressure Shift'),
  ('Hip-Shoulder Separation', 'Hip-Shoulder Separation (Disassociation)'),
  -- Explicit synonyms
  ('Hip-Shoulder Separation', 'Hip-Shoulder Disassociation'),
  ('Weight Shift', 'Weight Transfer'),
  ('Driver vs. Irons Technique', 'Driver vs Iron Swing'),
  ('Starting Line', 'Start line'),
  ('Club Path', 'Swing Path'),
  ('Face Angle', 'Club Face Angle'),
  ('Draw', 'Shot shape (draw)'),
  ('Swing Sequencing', 'Sequencing');

-- Repoint topic_mentions from each alias topic to its canonical topic.
UPDATE topic_mentions
SET topic_id = (
  SELECT t_canon.id
  FROM alias_map am
  JOIN topics t_alias ON t_alias.name = am.alias
  JOIN topics t_canon ON t_canon.name = am.canonical
  WHERE t_alias.id = topic_mentions.topic_id
)
WHERE topic_id IN (
  SELECT t.id FROM topics t JOIN alias_map am ON t.name = am.alias
);

-- Delete the alias topic rows now that nothing points to them.
DELETE FROM topics
WHERE name IN (SELECT alias FROM alias_map);

COMMIT;
