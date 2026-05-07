-- =============================================================================
-- ABYSS: KHAOS DESCENT — Phase 1 rename name_es → name
-- =============================================================================
-- The i18n charter declares English as the canonical language. We rename the
-- canonical text columns from `name_es` (locale-suffixed) to `name`
-- (locale-agnostic). Spanish text moves to the `translations` table at seed
-- time. This is forward-only: future schema changes do not need a rename if
-- canonical ever shifts.
-- =============================================================================

alter table public.elements           rename column name_es to name;
alter table public.status_effects     rename column name_es to name;
alter table public.rarity_tiers       rename column name_es to name;
alter table public.soul_forge_ranks   rename column name_es to name;
alter table public.damage_types       rename column name_es to name;
alter table public.currencies         rename column name_es to name;

alter table public.attributes         rename column name_es to name;
alter table public.sub_attributes     rename column name_es to name;

alter table public.classes            rename column name_es to name;
alter table public.paths              rename column name_es to name;
alter table public.hybrid_classes     rename column name_es to name;
alter table public.sub_branches       rename column name_es to name;

alter table public.titles             rename column name_es to name;

alter table public.biomes             rename column name_es to name;
alter table public.floors             rename column name_es to name;
alter table public.cities             rename column name_es to name;

alter table public.npcs               rename column name_es to name;
alter table public.npcs               rename column title_es to title;

alter table public.monster_families   rename column name_es to name;
alter table public.monster_tiers      rename column name_es to name;
alter table public.monsters           rename column name_es to name;

alter table public.items_master       rename column name_es to name;
alter table public.equipment_sets     rename column name_es to name;
