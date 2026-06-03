-- =============================================================================
-- Phase 4c — Side-view combat sprites (separate from overworld top-down)
--
-- The user pointed out that reusing the top-down exploration sprites in
-- the combat overlay looks wrong — combat in FF VI / Octopath uses
-- DIFFERENT, more detailed side-view art. So we add a second pair of
-- atlas columns to both `monsters` (enemies) and `classes` (player) for
-- the higher-fidelity combat sprites. Overworld code keeps reading
-- sprite_atlas / animation_atlas; combat code reads the new combat_*
-- columns when present.
--
-- Both new columns are jsonb-nullable; characters without combat art
-- yet (most of the bestiary) gracefully fall back to the top-down
-- sprite in the overlay until they get the side-view pass.
-- =============================================================================

alter table public.monsters
    add column if not exists combat_sprite_atlas    jsonb,
    add column if not exists combat_animation_atlas jsonb;

alter table public.classes
    add column if not exists combat_sprite_atlas    jsonb,
    add column if not exists combat_animation_atlas jsonb;
