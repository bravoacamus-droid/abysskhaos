-- =============================================================================
-- ABYSS: KHAOS DESCENT — Phase 2 audit asset soft-delete
-- =============================================================================
-- Adds the `deleted_from_r2_at` column to `asset_generations` so the cleanup
-- script can mark assets as removed from R2 without dropping the audit row.
-- We keep the prompt + cost + hash forever (cheap, useful for reproducibility),
-- only the binary in R2 goes away.
-- =============================================================================

alter table public.asset_generations
    add column if not exists deleted_from_r2_at timestamptz;

create index if not exists asset_generations_deleted_idx
    on public.asset_generations (deleted_from_r2_at)
    where deleted_from_r2_at is not null;
