-- =============================================================================
-- ABYSS: KHAOS DESCENT — Phase 3c animation atlas
-- =============================================================================
-- Adds an `animation_atlas` jsonb column to `classes` and `npcs`. The shape
-- mirrors PixelLab's animation output: keyed by animation name → direction →
-- ordered array of frame URLs. Phaser plays each direction's frames as a
-- looping animation (walk while moving, idle while stationary).
--
-- Example:
--   {
--     "walk":  { "south": ["url-f0", "url-f1", ...], "north": [...], ... },
--     "idle":  { "south": ["url-f0", "url-f1", ...], ... }
--   }
-- =============================================================================

alter table public.classes
    add column if not exists animation_atlas jsonb;

alter table public.npcs
    add column if not exists animation_atlas jsonb;
