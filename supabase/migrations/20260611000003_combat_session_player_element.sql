-- =============================================================================
-- Elemental matrix in combat — snapshot the player's affinity on the session.
--
-- The combat resolver (lib/server/combat.ts) now applies the 9-element
-- advantage matrix + affinity bonuses (docs/CANON.md §9). Mob elements ride
-- along inside the existing `mobs` jsonb; the player's element is a scalar like
-- the other player_* snapshots, so it gets its own column (captured at session
-- start, like player_atk — NOT a live FK to characters.element_id).
--
-- Nullable: in-flight pre-migration sessions and elementless players resolve to
-- a neutral 1.0× multiplier.
-- =============================================================================

alter table public.combat_sessions
    add column if not exists player_element text;
