-- 2026-10-15 17:21 SGT: planprice-api-scraper.timer ran run-scrapers.sh → fix:kinds + mappings:materialize:apply
-- with 691da44 classifications (pre-#172). Compared with the approved cafa247 set (+84) it wrote 20 extra derived rows:
--   le-chat-pro/team/enterprise × (Saba / Devstral 2 / Voxtral)                       ≈ 9 rows
--   gemini-code-assist-individual/standard/enterprise × *-image models (3 + 4 + 4)    = 11 rows
-- It also wrote pre-#172 model_selector to those 6 plans; the approved `npm run fix:kinds` (cafa247+) resets them.
-- Default ends in ROLLBACK. Review the SELECT output; change ONLY the final ROLLBACK to COMMIT to apply.
-- psql -X -v ON_ERROR_STOP=1 -f scripts/sql/2026-10-15-unapproved-mappings-rollback.sql
BEGIN;

CREATE TEMP TABLE unapproved ON COMMIT DROP AS
SELECT mapping.id, plan.slug AS plan_slug, model.slug AS model_slug, mapping.created_at
  FROM model_plan_mapping AS mapping
  JOIN plans  AS plan  ON plan.id  = mapping.plan_id
  JOIN models AS model ON model.id = mapping.model_id
 WHERE mapping.source = 'derived'
   AND (
     (plan.slug IN ('le-chat-pro','le-chat-team','le-chat-enterprise')
       AND (lower(model.slug) LIKE 'mistral-mistral-saba%'
            OR lower(model.slug) = 'mistral-devstral-2512'
            OR lower(model.slug) LIKE 'mistral-voxtral-%'))
     OR
     (plan.slug IN ('gemini-code-assist-individual','gemini-code-assist-standard','gemini-code-assist-enterprise')
       AND lower(model.slug) LIKE '%-image')
   );

SELECT plan_slug, count(*) AS rows FROM unapproved GROUP BY plan_slug ORDER BY plan_slug;
SELECT * FROM unapproved ORDER BY plan_slug, model_slug;

DO $$ BEGIN
  IF (SELECT count(*) FROM unapproved) > 30 THEN
    RAISE EXCEPTION 'unexpected row count %, expected ~20; nothing deleted', (SELECT count(*) FROM unapproved);
  END IF;
END $$;

DELETE FROM model_plan_mapping WHERE id IN (SELECT id FROM unapproved);
SELECT count(*) AS model_plan_mapping_total FROM model_plan_mapping;

ROLLBACK;
