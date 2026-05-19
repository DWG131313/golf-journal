-- ----------------------------------------------------------------------
-- Topic sub-categorization — 2026-05-18
--
-- Adds a `subcategory` column to topics so the /topics index can group
-- the long tail of single-mention entries under their natural parent
-- concept (Wrist → Wrist Angles + Wrist Bow + Wrist Path, etc.).
--
-- Topics with no clear cluster keep subcategory = NULL and render
-- under an "Other" group at the end of their category.
--
-- This is the user-facing label layer only — schema stays flat
-- (no parent_topic_id, no FK). A future iteration could promote
-- subcategories to first-class topic rows if cross-subcategory
-- aggregation becomes needed.
-- ----------------------------------------------------------------------

BEGIN;

ALTER TABLE topics ADD COLUMN subcategory TEXT;

CREATE TEMP TABLE sub_map(topic_name TEXT, subcategory TEXT);
INSERT INTO sub_map VALUES
  -- Fundamentals > Setup
  ('Setup', 'Setup'),
  ('Ball Position', 'Setup'),
  ('Grip', 'Setup'),
  ('Posture', 'Setup'),
  ('Spine Angle', 'Setup'),
  ('Hand Position', 'Setup'),
  ('Eye Dominance', 'Setup'),
  ('Hip Hinge', 'Setup'),
  -- Mechanics > Club Path
  ('Club Path', 'Club Path'),
  ('Inside-out path', 'Club Path'),
  -- Mechanics > Club Face
  ('Face Angle', 'Club Face'),
  ('Face Control', 'Club Face'),
  ('Face rotation', 'Club Face'),
  ('Face to Path', 'Club Face'),
  -- Mechanics > Backswing
  ('Backswing Length', 'Backswing'),
  ('Backswing Position', 'Backswing'),
  ('Backswing Width', 'Backswing'),
  ('Club Position at Top of Backswing', 'Backswing'),
  -- Mechanics > Hip
  ('Hip Rotation', 'Hip'),
  ('Hip-Shoulder Separation', 'Hip'),
  ('Early Hip Extension', 'Hip'),
  -- Mechanics > Wrist
  ('Wrist Angles', 'Wrist'),
  ('Wrist Bow', 'Wrist'),
  ('Wrist Path', 'Wrist'),
  -- Mechanics > Shaft
  ('Shaft Lean', 'Shaft'),
  ('Shaft Plane', 'Shaft'),
  ('Shaft Shallowing', 'Shaft'),
  -- Mechanics > Shoulder
  ('Shoulder Rotation', 'Shoulder'),
  ('Shoulder Tilt', 'Shoulder'),
  -- Mechanics > Trail Side
  ('Trail Arm Connection', 'Trail Side'),
  ('Trail Foot Pressure', 'Trail Side'),
  ('Trail Foot Stability', 'Trail Side'),
  -- Mechanics > Lateral Motion
  ('Lateral Movement', 'Lateral Motion'),
  ('Lateral Sway', 'Lateral Motion'),
  -- Mechanics > Low Point
  ('Low Point', 'Low Point'),
  ('Low Point Control', 'Low Point'),
  -- Mechanics > Strike / Contact
  ('Strike Location', 'Strike / Contact'),
  ('Off-Center Hits', 'Strike / Contact'),
  ('Shank', 'Strike / Contact'),
  ('Heel Contact', 'Strike / Contact'),
  ('Ball-First Contact', 'Strike / Contact'),
  ('Contact Quality', 'Strike / Contact'),
  -- Mechanics > Sequencing
  ('Swing Sequencing', 'Sequencing'),
  ('Kinematic Sequencing', 'Sequencing'),
  ('Downswing Sequencing', 'Sequencing'),
  ('Ground-Up Sequencing', 'Sequencing'),
  -- Mechanics > Speed / Tempo
  ('Swing Speed', 'Speed / Tempo'),
  ('Swing Tempo', 'Speed / Tempo'),
  ('Swing Tempo and Effort', 'Speed / Tempo'),
  ('Clubhead Speed', 'Speed / Tempo'),
  -- Mechanics > Weight / Ground
  ('Weight Shift', 'Weight / Ground'),
  ('Ground Force', 'Weight / Ground'),
  -- Mechanics > Body Rotation
  ('Body Rotation', 'Body Rotation'),
  ('Coil', 'Body Rotation'),
  ('Pivot', 'Body Rotation');

UPDATE topics
SET subcategory = (SELECT subcategory FROM sub_map WHERE topic_name = topics.name)
WHERE name IN (SELECT topic_name FROM sub_map);

COMMIT;
