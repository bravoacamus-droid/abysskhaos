-- Companions (pets): per-pet element typing + animation atlas; passives: icon.
--
-- A pet can be DUAL-element (element_secondary not null). Dual pets wield BOTH
-- elements offensively and inherit BOTH weaknesses defensively, and are rolled
-- at half probability (see lib/server/destiny/rolls.ts + data/destiny/companion-elements.ts).
--
-- animation_atlas: jsonb keyed by animation name -> array of frame URLs (R2),
--   e.g. { "greeting": [url,...], "attack": [...], "skill": [...], "sleep": [...],
--          "idea": [...], "talk": [...], "skill_metal": [...] }.
--   Single-facing (south frame, player-side). Populated by the pet upload pipeline.

alter table public.companions
    add column if not exists element_primary   text references public.elements(id) on delete restrict,
    add column if not exists element_secondary text references public.elements(id) on delete restrict,
    add column if not exists animation_atlas    jsonb;

-- Passive icon (32-48px). Generated later (Phase 3).
alter table public.passives
    add column if not exists icon_url text;
