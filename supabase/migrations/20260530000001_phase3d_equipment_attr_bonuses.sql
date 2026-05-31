-- =============================================================================
-- Phase 3d (cont.) — Attribute / vital bonuses on weapons + armor
--
-- The user asked that equipping a sword bump primary attrs (STR +1) and HP
-- max (+10) on top of the existing ATK bonus, so the inventory sheet
-- changes visibly when gear swaps. Until now equipment only contributed
-- weapons.base_atk and armor.base_def via lib/server/stats.ts, so STR /
-- AGI / INT / SPI / HP / MP never moved when re-equipping.
--
-- Pattern: add nullable-default-0 integer bonus_* columns directly on
-- weapons and armor. Cheap to migrate (DEFAULT 0 so existing rows stay
-- valid), trivial to extend (add bonus_X to the stat recompute), and
-- keeps the seed file readable. Accessories already have the simpler
-- accessories.bonus_attribute_id + bonus_value pattern; leave them alone
-- — they cover the original "+5 STR ring" use case.
--
-- New columns on weapons + armor:
--   bonus_str  bonus_agi  bonus_int  bonus_spi  bonus_hp  bonus_mp
-- =============================================================================

alter table public.weapons
    add column if not exists bonus_str integer not null default 0,
    add column if not exists bonus_agi integer not null default 0,
    add column if not exists bonus_int integer not null default 0,
    add column if not exists bonus_spi integer not null default 0,
    add column if not exists bonus_hp  integer not null default 0,
    add column if not exists bonus_mp  integer not null default 0;

alter table public.armor
    add column if not exists bonus_str integer not null default 0,
    add column if not exists bonus_agi integer not null default 0,
    add column if not exists bonus_int integer not null default 0,
    add column if not exists bonus_spi integer not null default 0,
    add column if not exists bonus_hp  integer not null default 0,
    add column if not exists bonus_mp  integer not null default 0;
