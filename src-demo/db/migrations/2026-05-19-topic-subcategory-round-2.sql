-- ----------------------------------------------------------------------
-- Topic subcategory cleanup — round 2 — 2026-05-19
--
-- After the first sub-categorization pass (2026-05-18), 34 topics remained
-- with subcategory = NULL. Most were legitimate standalones, but ~17 were
-- mergeable into existing buckets or warranted two new ones (Impact,
-- Shot Shape). Plus two missed duplicate clusters surfaced during review.
--
-- Before:  92 topics  (34 NULL, 58 with subcategory)
-- After:   90 topics  (17 NULL standalones, 73 with subcategory, 2 merged)
-- ----------------------------------------------------------------------

BEGIN;

-- ---- 1. Merge two missed duplicate clusters ----
CREATE TEMP TABLE alias_map(canonical TEXT, alias TEXT);
INSERT INTO alias_map VALUES
  ('Attack Angle', 'Angle of Attack'),     -- both mean the same impact attribute
  ('Shallowing', 'Shaft Shallowing');      -- "Shallowing" has more mentions; keep that

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

DELETE FROM topics WHERE name IN (SELECT alias FROM alias_map);

-- ---- 2. Assign subcategories to 17 topics ----
CREATE TEMP TABLE sub_map(topic_name TEXT, subcategory TEXT);
INSERT INTO sub_map VALUES
  -- New subcategory: Impact (4 topics)
  ('Attack Angle', 'Impact'),
  ('Impact Position', 'Impact'),
  ('Dynamic Loft', 'Impact'),
  ('Launch Angle', 'Impact'),
  -- New subcategory: Shot Shape (4 topics)
  ('Draw', 'Shot Shape'),
  ('Ball Flight', 'Shot Shape'),
  ('Ball flight shape', 'Shot Shape'),
  ('Starting Line', 'Shot Shape'),
  -- Backswing += Takeaway
  ('Takeaway', 'Backswing'),
  -- Club Path += faults and exit
  ('Over-the-Top', 'Club Path'),
  ('Club Exit', 'Club Path'),
  ('Club Exit Direction', 'Club Path'),
  -- Shaft += Shallowing (the merged one)
  ('Shallowing', 'Shaft'),
  -- Low Point += Arc Bottom / Low Point
  ('Arc Bottom / Low Point', 'Low Point'),
  -- Wrist += related wrist/hand concepts
  ('Hand Path', 'Wrist'),
  ('Early Release', 'Wrist'),
  -- Setup += Spine Tilt
  ('Spine Tilt', 'Setup');

UPDATE topics
SET subcategory = (SELECT subcategory FROM sub_map WHERE topic_name = topics.name)
WHERE name IN (SELECT topic_name FROM sub_map);

COMMIT;
