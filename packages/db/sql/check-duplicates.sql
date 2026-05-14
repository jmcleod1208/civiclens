-- ─── Health checks for scraper dedup logic ──────────────────────────────────
-- Run these manually with psql after scraping to verify that politicians
-- aren't being duplicated and that DocumentPolitician joins are clean.
--
-- Usage:
--   psql "$DATABASE_URL" -f packages/db/sql/check-duplicates.sql

-- ── 1. Duplicate politicians by exact name ─────────────────────────────────
SELECT name, COUNT(*) AS count
FROM "Politician"
GROUP BY name
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 20;

-- ── 2. Duplicate politicians by name + jurisdiction ───────────────────────
-- More precise: catches "John Smith" in two different states (legitimate)
-- vs the same legislator created twice within one state (bad).
SELECT name, jurisdiction, COUNT(*) AS count
FROM "Politician"
GROUP BY name, jurisdiction
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 20;

-- ── 3. Politicians missing an openStatesId or bioguideId ──────────────────
SELECT id, name, jurisdiction, "sourceIds"
FROM "Politician"
WHERE "sourceIds" = '{}'::jsonb
   OR "sourceIds" IS NULL
LIMIT 20;

-- ── 4. CivicDocuments without a sourceUrl (should be zero) ────────────────
SELECT id, title, jurisdiction
FROM "CivicDocument"
WHERE "sourceUrl" IS NULL OR "sourceUrl" = ''
LIMIT 20;

-- ── 5. Document counts by jurisdiction + level ────────────────────────────
SELECT level, jurisdiction, COUNT(*) AS docs
FROM "CivicDocument"
GROUP BY level, jurisdiction
ORDER BY docs DESC;
