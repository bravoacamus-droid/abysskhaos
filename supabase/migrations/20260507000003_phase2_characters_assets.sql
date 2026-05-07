-- =============================================================================
-- ABYSS: KHAOS DESCENT — Phase 2: characters + asset_generations
-- =============================================================================
-- Adds the player-state primitives needed for character creation, plus the
-- audit trail required by docs/ASSET_PIPELINE.md for every PixelLab call.
-- Includes class.portrait_url so the wizard can show the generated art.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- classes.portrait_url — R2 URL of the class portrait (96x96 PNG).
-- Nullable until Phase 2 generates them. Public read of `classes` later in
-- Phase 2 is enabled via a dedicated read-only policy.
-- -----------------------------------------------------------------------------

alter table public.classes
    add column if not exists portrait_url text;

-- -----------------------------------------------------------------------------
-- characters — one row per character a user has created. Free tier: 2 slots
-- per user; slots 3 and 4 unlock with USDT in Phase 12.
-- -----------------------------------------------------------------------------

create table if not exists public.characters (
    id                       uuid primary key default gen_random_uuid(),
    user_id                  uuid not null references public.users(id) on delete cascade,
    slot_index               integer not null check (slot_index between 1 and 4),
    name                     text not null check (length(name) between 1 and 24),
    class_id                 text not null references public.classes(id) on delete restrict,
    -- Lv 1 stats are seeded from classes.starting_*; the columns are
    -- denormalised so combat resolution doesn't need to join the class table.
    level                    integer not null default 1 check (level between 1 and 60),
    exp                      bigint not null default 0,
    hp_current               integer not null,
    hp_max                   integer not null,
    mp_current               integer not null,
    mp_max                   integer not null,
    atk                      integer not null,
    def                      integer not null,
    -- Primary attribute scores. Distinct columns so we can index on STR-rich
    -- characters etc. Sub-stats live in `allocated_sub_attrs` jsonb.
    attr_strength            integer not null default 0,
    attr_agility             integer not null default 0,
    attr_intelligence        integer not null default 0,
    attr_spirit              integer not null default 0,
    -- jsonb of { sub_attribute_id: points_allocated }
    allocated_sub_attrs      jsonb not null default '{}'::jsonb,
    -- Path / hybrid / sub-branch are nullable until the player reaches the
    -- required level (15 / 25 / 30) and chooses.
    path_id                  text references public.paths(id) on delete restrict,
    hybrid_class_id          text references public.hybrid_classes(id) on delete restrict,
    sub_branch_id            text references public.sub_branches(id) on delete restrict,
    -- Currently-equipped title (defaults to the per-class starter once seeded).
    title_id                 text references public.titles(id) on delete restrict,
    -- Khryn balance (off-chain currency). NFT items live in their own tables.
    khryn                    bigint not null default 0,
    -- Position in the abyss. Floor 100 = entry point; null until the tutorial
    -- at Cedric is complete (Phase 3).
    current_floor            integer references public.floors(floor_number) on delete restrict,
    current_room_id          uuid,
    -- Soft-delete: characters are never hard-deleted (NFT history matters).
    is_active                boolean not null default true,
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now(),
    deleted_at               timestamptz,
    -- A user can only have one character per slot.
    constraint characters_user_slot_unique unique (user_id, slot_index)
);

create index if not exists characters_user_idx on public.characters (user_id) where is_active;
create index if not exists characters_class_idx on public.characters (class_id);
create index if not exists characters_floor_idx on public.characters (current_floor);

-- Enforce the 4-slot ceiling per user. Hard cap regardless of slots paid.
create or replace function public.enforce_character_slot_limit() returns trigger
language plpgsql as $$
declare
    active_count integer;
begin
    if new.is_active is false then
        return new;
    end if;
    select count(*) into active_count
    from public.characters
    where user_id = new.user_id
        and is_active
        and (TG_OP = 'INSERT' or id <> new.id);
    if active_count >= 4 then
        raise exception 'character_slot_limit_exceeded' using errcode = 'P0001';
    end if;
    return new;
end;
$$;

drop trigger if exists tg_enforce_character_slot_limit on public.characters;
create trigger tg_enforce_character_slot_limit
    before insert or update on public.characters
    for each row execute function public.enforce_character_slot_limit();

-- -----------------------------------------------------------------------------
-- asset_generations — audit trail for every PixelLab call. Per
-- docs/ASSET_PIPELINE.md, every generation MUST be logged so we can
-- reproduce, audit cost, and debug visual issues.
-- -----------------------------------------------------------------------------

create table if not exists public.asset_generations (
    id                  uuid primary key default gen_random_uuid(),
    entity_type         text not null,           -- 'class', 'monster', 'npc', 'item', ...
    entity_id           text not null,           -- slug of the entity
    field               text not null default 'portrait', -- 'portrait', 'sprite', 'icon', 'background'
    prompt              text not null,
    endpoint            text not null,           -- 'pixflux', 'bitforge', 'animate-with-skeleton', ...
    generation_size     text not null,           -- '64x64', '96x96', '128x128', ...
    seed                bigint,
    output_hash         text not null,           -- sha256 hex of the resulting PNG
    output_r2_key       text not null,           -- R2 key, e.g. assets/<hash>.png
    output_r2_url       text not null,           -- public URL
    output_bytes        integer not null,
    cost_usd            numeric(10,6),           -- response.usage.usd if present
    generated_via       text not null check (generated_via in ('mcp','http_api','manual')),
    generated_at        timestamptz not null default now(),
    -- Any extra metadata (animation frames, character_id from PixelLab, etc.)
    metadata            jsonb not null default '{}'::jsonb,
    constraint asset_generations_hash_unique unique (output_hash)
);

create index if not exists asset_generations_entity_idx on public.asset_generations (entity_type, entity_id);
create index if not exists asset_generations_generated_at_idx on public.asset_generations (generated_at desc);

-- -----------------------------------------------------------------------------
-- Read-only public access to `classes` so the character-creation wizard can
-- show class cards (with portraits) without needing service-role on the client.
-- Other catalog tables stay locked down until needed.
-- -----------------------------------------------------------------------------

drop policy if exists classes_no_anon_access on public.classes;
create policy classes_public_read on public.classes for select
    to anon, authenticated
    using (true);

-- -----------------------------------------------------------------------------
-- Lockdown new tables.
-- -----------------------------------------------------------------------------

select public.lockdown_table('public.characters');
select public.lockdown_table('public.asset_generations');
