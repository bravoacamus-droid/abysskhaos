-- =============================================================================
-- Animated element orbs — orb_atlas on elements.
--
-- The orb art has 8 directional frames; cycling them gives the "spinning orb
-- with the element moving inside" look (what PixelLab shows on hover). We store
-- the 8 R2 frame URLs in a smooth rotation order so the client can play them as
-- a loop. `orb_url` stays as the single static fallback (the south frame).
--
-- Populated by scripts/wire-element-orbs.ts. Nullable until then.
-- =============================================================================

alter table public.elements
    add column if not exists orb_atlas jsonb;
