-- =============================================================================
-- ABYSS: KHAOS DESCENT — Phase 1 canonical schema
-- =============================================================================
-- Reference catalog tables for the entire game design (per docs/CANON.md and
-- the 13 ABYSS_MASTER docs). All tables are idempotent (re-running safe) and
-- start with deny-all RLS per docs/ARCHITECTURE.md §Security.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Universal helpers
-- -----------------------------------------------------------------------------

-- updated_at trigger function — applied to every mutable table.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- Helper: attach the updated_at trigger + enable RLS deny-all for a table.
-- Called per-table at the bottom of each section.
create or replace function public.lockdown_table(target_table regclass) returns void
language plpgsql as $$
declare
    table_name_only text;
    schema_only text;
    policy_name text;
begin
    select n.nspname, c.relname into schema_only, table_name_only
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.oid = target_table;

    -- Touch updated_at trigger (only if column exists)
    if exists (
        select 1 from information_schema.columns
        where table_schema = schema_only
            and table_name = table_name_only
            and column_name = 'updated_at'
    ) then
        execute format('drop trigger if exists tg_touch_updated_at on %I.%I',
            schema_only, table_name_only);
        execute format(
            'create trigger tg_touch_updated_at before update on %I.%I '
            || 'for each row execute function public.touch_updated_at()',
            schema_only, table_name_only);
    end if;

    -- RLS enable + deny-all policy
    execute format('alter table %I.%I enable row level security',
        schema_only, table_name_only);
    policy_name := table_name_only || '_no_anon_access';
    execute format('drop policy if exists %I on %I.%I',
        policy_name, schema_only, table_name_only);
    execute format(
        'create policy %I on %I.%I for all to anon, authenticated '
        || 'using (false) with check (false)',
        policy_name, schema_only, table_name_only);
end;
$$;

-- =============================================================================
-- 1. REFERENCE ENUMS
-- =============================================================================

create table if not exists public.elements (
    id              text primary key,
    name_es         text not null,
    description     text,
    color_hex       text,
    sort_order      integer not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create table if not exists public.status_effects (
    id                       text primary key,
    name_es                  text not null,
    description              text,
    base_damage_pct          numeric(5,2),
    base_duration_turns      integer,
    is_canonical             boolean not null default false,
    sort_order               integer not null default 0,
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now()
);

create index if not exists status_effects_canonical_idx
    on public.status_effects (is_canonical) where is_canonical;

create table if not exists public.rarity_tiers (
    id                  text primary key,
    name_es             text not null,
    color_hex           text,
    is_nft_eligible     boolean not null default false,
    sort_order          integer not null default 0,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create table if not exists public.soul_forge_ranks (
    id                       text primary key,
    name_es                  text not null,
    battle_threshold_min     integer not null,
    battle_threshold_max     integer,
    bonus_stat_pct           numeric(5,2) not null,
    has_awakening            boolean not null default false,
    sort_order               integer not null default 0,
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now()
);

create table if not exists public.damage_types (
    id              text primary key,
    name_es         text not null,
    description     text,
    sort_order      integer not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create table if not exists public.currencies (
    id              text primary key,
    name_es         text not null,
    is_onchain      boolean not null default false,
    decimals        integer not null default 0,
    chain           text,
    sort_order      integer not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- =============================================================================
-- 2. ATTRIBUTES
-- =============================================================================

create table if not exists public.attributes (
    id              text primary key,
    name_es         text not null,
    abbrev          text not null,
    description     text,
    sort_order      integer not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create table if not exists public.sub_attributes (
    id                      text primary key,
    parent_attribute_id     text not null references public.attributes(id) on delete restrict,
    name_es                 text not null,
    description             text,
    effect_per_point        numeric(7,3),
    effect_unit             text,
    sort_order              integer not null default 0,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create index if not exists sub_attributes_parent_idx
    on public.sub_attributes (parent_attribute_id);

-- =============================================================================
-- 3. CLASSES, PATHS, HYBRIDS, SUB-BRANCHES
-- =============================================================================

create table if not exists public.classes (
    id                       text primary key,
    name_es                  text not null,
    description              text,
    primary_attr_a_id        text not null references public.attributes(id) on delete restrict,
    primary_attr_b_id        text not null references public.attributes(id) on delete restrict,
    starting_hp              integer not null,
    starting_mp              integer not null,
    starting_atk             integer not null,
    starting_def             integer not null,
    sort_order               integer not null default 0,
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now()
);

create table if not exists public.paths (
    id              text primary key,
    class_id        text not null references public.classes(id) on delete restrict,
    name_es         text not null,
    description     text,
    unlock_level    integer not null default 15,
    sort_order      integer not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists paths_class_idx on public.paths (class_id);

create table if not exists public.hybrid_classes (
    id                       text primary key,
    name_es                  text not null,
    description              text,
    parent_class_a_id        text not null references public.classes(id) on delete restrict,
    parent_class_b_id        text not null references public.classes(id) on delete restrict,
    unlock_level             integer not null default 25,
    requires_item            text,
    sort_order               integer not null default 0,
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now(),
    constraint hybrid_distinct_parents check (parent_class_a_id <> parent_class_b_id)
);

create index if not exists hybrid_parent_a_idx on public.hybrid_classes (parent_class_a_id);
create index if not exists hybrid_parent_b_idx on public.hybrid_classes (parent_class_b_id);

create table if not exists public.sub_branches (
    id                  text primary key,
    hybrid_class_id     text not null references public.hybrid_classes(id) on delete restrict,
    name_es             text not null,
    description         text,
    unlock_level        integer not null default 30,
    sort_order          integer not null default 0,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists sub_branches_hybrid_idx on public.sub_branches (hybrid_class_id);

-- =============================================================================
-- 4. TITLES (catalog placeholder — full 255 populated in a later phase)
-- =============================================================================

create table if not exists public.titles (
    id                          text primary key,
    name_es                     text not null,
    description                 text,
    tier                        text not null check (tier in ('base', 'hybrid', 'pp_iii_unique')),
    is_unique_per_server        boolean not null default false,
    is_soulbound                boolean not null default false,
    class_id                    text references public.classes(id) on delete restrict,
    path_id                     text references public.paths(id) on delete restrict,
    hybrid_class_id             text references public.hybrid_classes(id) on delete restrict,
    sub_branch_id               text references public.sub_branches(id) on delete restrict,
    unlock_level                integer,
    sort_order                  integer not null default 0,
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now()
);

create index if not exists titles_tier_idx on public.titles (tier);
create index if not exists titles_class_idx on public.titles (class_id);
create index if not exists titles_path_idx on public.titles (path_id);
create index if not exists titles_hybrid_idx on public.titles (hybrid_class_id);
create index if not exists titles_sub_branch_idx on public.titles (sub_branch_id);

-- =============================================================================
-- 5. WORLD: BIOMES, FLOORS, CITIES, NPCS
-- =============================================================================

create table if not exists public.biomes (
    id                      text primary key,
    name_es                 text not null,
    description             text,
    primary_color_hex       text,
    secondary_color_hex     text,
    sort_order              integer not null default 0,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create table if not exists public.floors (
    floor_number        integer primary key check (floor_number between 1 and 100),
    name_es             text not null,
    biome_id            text references public.biomes(id) on delete restrict,
    season              integer not null check (season in (1, 2, 3)),
    is_hub              boolean not null default false,
    is_boss_floor       boolean not null default false,
    description         text,
    rooms_min           integer not null default 80,
    rooms_max           integer not null default 120,
    zones_min           integer not null default 3,
    zones_max           integer not null default 4,
    exp_modifier        numeric(6,3) not null default 1.000,
    danger_tier         integer not null default 1,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists floors_biome_idx on public.floors (biome_id);
create index if not exists floors_season_idx on public.floors (season);

create table if not exists public.cities (
    id                  text primary key,
    name_es             text not null,
    description         text,
    main_floor          integer not null references public.floors(floor_number) on delete restrict,
    floor_range_min     integer references public.floors(floor_number) on delete restrict,
    floor_range_max     integer references public.floors(floor_number) on delete restrict,
    sort_order          integer not null default 0,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists cities_main_floor_idx on public.cities (main_floor);

create table if not exists public.npcs (
    id              text primary key,
    name_es         text not null,
    title_es        text,
    description     text,
    is_permanent    boolean not null default true,
    home_city_id    text references public.cities(id) on delete restrict,
    profession      text,
    sort_order      integer not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists npcs_home_city_idx on public.npcs (home_city_id);
create index if not exists npcs_permanent_idx on public.npcs (is_permanent);

-- =============================================================================
-- 6. BESTIARY
-- =============================================================================

create table if not exists public.monster_families (
    id              text primary key,
    name_es         text not null,
    description     text,
    sort_order      integer not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create table if not exists public.monster_tiers (
    id                  text primary key,
    name_es             text not null,
    description         text,
    can_be_captured     boolean not null default true,
    sort_order          integer not null default 0,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create table if not exists public.monsters (
    id                      text primary key,
    name_es                 text not null,
    family_id               text not null references public.monster_families(id) on delete restrict,
    tier_id                 text not null references public.monster_tiers(id) on delete restrict,
    base_hp                 integer not null,
    base_mp                 integer not null default 0,
    base_atk                integer not null,
    base_def                integer not null,
    base_exp                integer not null,
    primary_element_id      text references public.elements(id) on delete restrict,
    introduced_floor        integer references public.floors(floor_number) on delete restrict,
    description             text,
    is_capturable           boolean not null default true,
    is_world_boss           boolean not null default false,
    soul_size               text check (soul_size in ('s', 'm', 'l', 'xl', 'xxl')),
    sort_order              integer not null default 0,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create index if not exists monsters_family_idx on public.monsters (family_id);
create index if not exists monsters_tier_idx on public.monsters (tier_id);
create index if not exists monsters_floor_idx on public.monsters (introduced_floor);

-- =============================================================================
-- 7. ITEMS — master + sub-tables
-- =============================================================================

create table if not exists public.items_master (
    id                              text primary key,
    name_es                         text not null,
    item_type                       text not null check (item_type in
        ('weapon','armor','accessory','consumable','gem','quest','misc')),
    rarity_id                       text not null references public.rarity_tiers(id) on delete restrict,
    description                     text,
    icon_path                       text,
    base_price_khryn                integer,
    is_tradeable                    boolean not null default true,
    is_destroyable_on_death         boolean not null default false,
    sort_order                      integer not null default 0,
    created_at                      timestamptz not null default now(),
    updated_at                      timestamptz not null default now()
);

create index if not exists items_master_type_idx on public.items_master (item_type);
create index if not exists items_master_rarity_idx on public.items_master (rarity_id);

create table if not exists public.weapons (
    item_id                 text primary key references public.items_master(id) on delete cascade,
    weapon_class            text not null,
    base_atk                integer not null,
    base_durability         integer not null default 100,
    sockets_max             integer not null default 0 check (sockets_max between 0 and 3),
    handedness              text not null check (handedness in ('one_handed','two_handed','off_hand')),
    primary_element_id      text references public.elements(id) on delete restrict,
    soul_capacity_size      text check (soul_capacity_size in ('s', 'm', 'l', 'xl', 'xxl')),
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create table if not exists public.armor (
    item_id             text primary key references public.items_master(id) on delete cascade,
    armor_class         text not null check (armor_class in
        ('pesada','ligera','tunica','runica','viva','espectral','khaos')),
    slot                text not null check (slot in
        ('head','chest','arms','legs','feet','off_hand_shield')),
    base_def            integer not null,
    base_durability     integer not null default 100,
    sockets_max         integer not null default 0 check (sockets_max between 0 and 1),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists armor_slot_idx on public.armor (slot);

create table if not exists public.accessories (
    item_id                 text primary key references public.items_master(id) on delete cascade,
    slot                    text not null check (slot in ('ring','amulet')),
    bonus_attribute_id      text references public.attributes(id) on delete restrict,
    bonus_value             integer,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create index if not exists accessories_slot_idx on public.accessories (slot);

create table if not exists public.consumables (
    item_id                 text primary key references public.items_master(id) on delete cascade,
    consumable_type         text not null,
    use_in_combat           boolean not null default true,
    cooldown_seconds        integer not null default 0,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create table if not exists public.gems (
    item_id             text primary key references public.items_master(id) on delete cascade,
    gem_family          text not null check (gem_family in
        ('fuego','alma','prismatica','fortuna','vinculo')),
    bonus_description   text not null,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- =============================================================================
-- 8. EQUIPMENT SETS
-- =============================================================================

create table if not exists public.equipment_sets (
    id                          text primary key,
    name_es                     text not null,
    description                 text,
    associated_title_id         text references public.titles(id) on delete restrict,
    is_biome_set                boolean not null default false,
    biome_id                    text references public.biomes(id) on delete restrict,
    piece_count                 integer not null check (piece_count between 4 and 6),
    sort_order                  integer not null default 0,
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now()
);

create index if not exists equipment_sets_biome_idx on public.equipment_sets (biome_id);
create index if not exists equipment_sets_title_idx on public.equipment_sets (associated_title_id);

create table if not exists public.set_pieces (
    set_id      text not null references public.equipment_sets(id) on delete cascade,
    item_id     text not null references public.items_master(id) on delete restrict,
    primary key (set_id, item_id)
);

create index if not exists set_pieces_item_idx on public.set_pieces (item_id);

create table if not exists public.set_bonuses (
    set_id              text not null references public.equipment_sets(id) on delete cascade,
    pieces_required     integer not null check (pieces_required between 2 and 6),
    bonus_description   text not null,
    primary key (set_id, pieces_required)
);

-- =============================================================================
-- 9. LOOT TABLES
-- =============================================================================

create table if not exists public.loot_tables (
    id                  text primary key,
    description         text,
    monster_tier_id     text references public.monster_tiers(id) on delete restrict,
    rarity_id           text not null references public.rarity_tiers(id) on delete restrict,
    drop_chance_pct     numeric(5,2) not null,
    sort_order          integer not null default 0,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists loot_tables_tier_idx on public.loot_tables (monster_tier_id);

create table if not exists public.monster_drops (
    monster_id          text not null references public.monsters(id) on delete cascade,
    item_id             text references public.items_master(id) on delete restrict,
    rarity_id           text references public.rarity_tiers(id) on delete restrict,
    drop_chance_pct     numeric(5,2) not null,
    is_guaranteed       boolean not null default false,
    primary key (monster_id, item_id)
);

create index if not exists monster_drops_item_idx on public.monster_drops (item_id);

-- =============================================================================
-- LOCKDOWN: enable RLS deny-all + updated_at trigger on every table
-- =============================================================================

select public.lockdown_table('public.elements');
select public.lockdown_table('public.status_effects');
select public.lockdown_table('public.rarity_tiers');
select public.lockdown_table('public.soul_forge_ranks');
select public.lockdown_table('public.damage_types');
select public.lockdown_table('public.currencies');
select public.lockdown_table('public.attributes');
select public.lockdown_table('public.sub_attributes');
select public.lockdown_table('public.classes');
select public.lockdown_table('public.paths');
select public.lockdown_table('public.hybrid_classes');
select public.lockdown_table('public.sub_branches');
select public.lockdown_table('public.titles');
select public.lockdown_table('public.biomes');
select public.lockdown_table('public.floors');
select public.lockdown_table('public.cities');
select public.lockdown_table('public.npcs');
select public.lockdown_table('public.monster_families');
select public.lockdown_table('public.monster_tiers');
select public.lockdown_table('public.monsters');
select public.lockdown_table('public.items_master');
select public.lockdown_table('public.weapons');
select public.lockdown_table('public.armor');
select public.lockdown_table('public.accessories');
select public.lockdown_table('public.consumables');
select public.lockdown_table('public.gems');
select public.lockdown_table('public.equipment_sets');
select public.lockdown_table('public.set_pieces');
select public.lockdown_table('public.set_bonuses');
select public.lockdown_table('public.loot_tables');
select public.lockdown_table('public.monster_drops');
