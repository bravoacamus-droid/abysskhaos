-- =============================================================================
-- ABYSS: KHAOS DESCENT — Phase 3c entry direction tracking
-- =============================================================================
-- Adds `current_room_entry_dir` so /room knows which exit the player just
-- came in through. The /move endpoint sets this to the direction-opposite
-- of the move (player moves south → entered the new room from the north),
-- and /room overrides the room's default spawn to a tile next to that
-- exit. Without this, the player always re-spawned at the room's hardcoded
-- spawn no matter where they came from — felt incoherent.
-- =============================================================================

alter table public.characters
    add column if not exists current_room_entry_dir text
        check (current_room_entry_dir in ('north', 'south', 'east', 'west'));
