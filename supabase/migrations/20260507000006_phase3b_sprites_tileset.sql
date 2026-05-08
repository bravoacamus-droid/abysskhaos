-- =============================================================================
-- ABYSS: KHAOS DESCENT — Phase 3b sprite + tileset assets
-- =============================================================================
-- Adds the columns needed to wire the Phaser scene to PixelLab-generated
-- art:
--   * `classes.sprite_atlas` / `npcs.sprite_atlas` — jsonb with the URL for
--     each cardinal direction: { south, north, east, west }. Phase 3b uses
--     4 directions; expanding to 8 (adds NE/NW/SE/SW keys) is additive and
--     does not require another migration.
--   * `biomes.tileset_url` + `biomes.tileset_metadata` — the single PNG of
--     the Wang tileset and the metadata describing tile coordinates +
--     transition rules.
--   * `rooms.tilemap_data` — the per-room tile array + spawn point.
--   * `room_npcs.tile_x` / `tile_y` — where in the room the NPC stands.
-- =============================================================================

alter table public.classes
    add column if not exists sprite_atlas jsonb;

alter table public.npcs
    add column if not exists sprite_atlas jsonb;

alter table public.biomes
    add column if not exists tileset_url text,
    add column if not exists tileset_metadata jsonb;

alter table public.rooms
    add column if not exists tilemap_data jsonb;

alter table public.room_npcs
    add column if not exists tile_x integer,
    add column if not exists tile_y integer;
