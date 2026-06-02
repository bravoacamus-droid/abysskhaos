-- =============================================================================
-- Phase 3d (cont.) — Per-character "opened props" tracking
--
-- Adds characters.opened_props text[] so chests / levers / hatches can
-- remember they've been triggered by THIS character. Each entry is a
-- composite key: `${room_id}:${prop_kind}:${tile_x}:${tile_y}` —
-- room-scoped so a player who opens the chest in r02 isn't auto-marked
-- as having opened a different chest in r07.
--
-- Why a text[] column vs a separate join table:
--   - Phase 3d ships exactly one interactable per room. Sub-millisecond
--     lookups; cardinality of dozens per character even mid-game.
--   - Avoids an extra join in the hot /room read path.
--   - When the catalogue grows (Phase 5+, hundreds of chests) we can
--     promote to a `character_prop_state` table without forcing a
--     schema rewrite of the interact endpoint — same key format works
--     as a (character_id, key) row.
-- =============================================================================

alter table public.characters
    add column if not exists opened_props text[] not null default '{}'::text[];

-- GIN index for the array-contains query (`opened_props @> array['key']`)
-- the interact endpoint runs to check whether the key is already there.
create index if not exists characters_opened_props_idx
    on public.characters using gin (opened_props);
