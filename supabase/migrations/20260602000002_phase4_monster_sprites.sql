-- =============================================================================
-- Phase 4a — Visual atlases on monsters
--
-- Adds sprite_atlas + animation_atlas to monsters so the cutscene +
-- (eventually) combat scene can render enemies the same way the player
-- + NPCs do — per-direction idle sprite + per-(animation,direction)
-- frame URL list. Both columns default to NULL so monsters without art
-- yet (zombies, keese, …) keep working as catalog-only entries.
--
-- Why mirror NPCs columns:
--   - The Phaser scene already has createAnimationsFor(prefix, atlas)
--     which consumes exactly this shape; reusing it means the cutscene
--     spawns enemies with zero rendering-path forks.
--   - Future combat scene will use the same atlas to play attack /
--     hurt / death animations once those frames are generated.
-- =============================================================================

alter table public.monsters
    add column if not exists sprite_atlas    jsonb,
    add column if not exists animation_atlas jsonb;
