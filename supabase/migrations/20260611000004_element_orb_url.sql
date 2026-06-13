-- =============================================================================
-- Element affinity orb art — orb_url on elements.
--
-- The 9 elemental "orbs" (a glass sphere with the living element inside) are
-- shown on the destiny reveal and the combat HUD. Each element gets one R2
-- content-hashed PNG. Populated by scripts/wire-element-orbs.ts (downloads the
-- PixelLab south frame, uploads to R2, sets this column). Nullable until then.
-- =============================================================================

alter table public.elements
    add column if not exists orb_url text;
