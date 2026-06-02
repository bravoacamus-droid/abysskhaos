-- =============================================================================
-- Phase 4a — Scripted encounter tracking
--
-- Adds characters.seen_encounters text[] so a scripted encounter (e.g.
-- the centaur + archer ambush in r02) fires EXACTLY ONCE per character.
-- Each entry is an encounter_id string declared on a prop's
-- metadata.encounter block; the scene reads this array to suppress the
-- trigger after the first fire, and the server enforces it before
-- handing back the combat seed.
--
-- Why a new column (vs reusing opened_props):
--   - Opened-props is a render-state concept (chest changes sprite);
--     seen-encounters is a gameplay-state concept (an encounter played).
--     Keeping them separate keeps the column names self-documenting +
--     lets the scene query them independently (an opened chest doesn't
--     mean we should skip a future combat re-trigger on the same tile).
--   - Both share the same array + GIN-index pattern so the cost is
--     near zero.
-- =============================================================================

alter table public.characters
    add column if not exists seen_encounters text[] not null default '{}'::text[];

create index if not exists characters_seen_encounters_idx
    on public.characters using gin (seen_encounters);
