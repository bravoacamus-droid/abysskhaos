-- =============================================================================
-- Phase 3d — Inventory, equipped slots, tutorial state, ground items
--
-- Three additions to support the tutorial pickup sequence + base for the
-- whole Diablo-style inventory game loop:
--
--   1. characters.tutorial_step  — text enum, gates input during first login
--                                  ('walk_to_cedric' -> ... -> 'complete')
--   2. character_items           — one row per item instance owned by a
--                                  character. Location is EITHER an
--                                  inventory grid slot (0-39, Stardew/Diablo
--                                  style) OR an equipped slot string. Exactly
--                                  one of the two is non-null, enforced by a
--                                  check constraint + partial unique indexes.
--   3. room_ground_items         — items lying on the floor in a room.
--                                  Tutorial drops use visible_to_character_id
--                                  to scope the sword to a single player.
--
-- All keep RLS off for now (Phase 4 will add the policies).
-- =============================================================================

-- 1) Tutorial step on characters --------------------------------------------------

ALTER TABLE public.characters
    ADD COLUMN IF NOT EXISTS tutorial_step text
        CHECK (tutorial_step IN (
            'walk_to_cedric',   -- spawn → only ↑ is allowed, must reach Cedric
            'after_dialogue',   -- dialogue done, sword has dropped behind player
            'pickup_sword',     -- player adjacent to sword, Z prompt visible
            'equip_sword',      -- sword in inventory, inventory forced open
            'complete'          -- tutorial done, free play
        ))
        DEFAULT 'walk_to_cedric';

create index if not exists characters_tutorial_step_idx
    on public.characters (tutorial_step)
    where tutorial_step <> 'complete';

-- 2) Character items (instances) -------------------------------------------------

-- Each row = one stack of one item kind, sitting in EITHER:
--   - an inventory grid slot (0-39, 40 total = 5 cols x 8 rows visually), OR
--   - an equipped slot (main_hand, off_hand, armor_*, accessory_*).
-- The check constraint enforces exactly one location.
-- Partial unique indexes prevent two items in the same slot.
create table if not exists public.character_items (
    id              uuid primary key default gen_random_uuid(),
    character_id    uuid not null references public.characters(id) on delete cascade,
    item_id         text not null references public.items_master(id) on delete restrict,
    -- LOCATION: exactly one of these is non-null.
    inventory_slot  integer check (inventory_slot between 0 and 39),
    equipped_slot   text check (equipped_slot in (
        'main_hand', 'off_hand',
        'armor_head', 'armor_chest', 'armor_arms', 'armor_legs', 'armor_feet',
        'accessory_ring_1', 'accessory_ring_2', 'accessory_amulet'
    )),
    -- Per-instance state. Stackables (potions, gems) use quantity > 1; weapons,
    -- armor stay at quantity=1 and carry durability.
    quantity        integer not null default 1 check (quantity > 0),
    durability      integer,
    metadata        jsonb   not null default '{}'::jsonb,
    acquired_at     timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    -- Exactly one location: inventory XOR equipped.
    constraint character_items_exactly_one_location check (
        (inventory_slot is not null and equipped_slot is null) or
        (inventory_slot is null     and equipped_slot is not null)
    )
);

create index if not exists character_items_character_idx
    on public.character_items (character_id);

-- Per-character: at most one item per inventory slot.
create unique index if not exists character_items_inventory_slot_unique
    on public.character_items (character_id, inventory_slot)
    where inventory_slot is not null;

-- Per-character: at most one item per equipped slot.
create unique index if not exists character_items_equipped_slot_unique
    on public.character_items (character_id, equipped_slot)
    where equipped_slot is not null;

-- 3) Room ground items ----------------------------------------------------------

-- Items lying on the floor in a room. The tutorial sword drop uses
-- visible_to_character_id to scope the drop to just the player that triggered
-- the dialogue. NULL = visible to everyone (future loot drops from mobs).
create table if not exists public.room_ground_items (
    id                       uuid primary key default gen_random_uuid(),
    room_id                  uuid not null references public.rooms(id) on delete cascade,
    position_x               integer not null,
    position_y               integer not null,
    item_id                  text not null references public.items_master(id) on delete cascade,
    quantity                 integer not null default 1 check (quantity > 0),
    visible_to_character_id  uuid references public.characters(id) on delete cascade,
    metadata                 jsonb not null default '{}'::jsonb,
    dropped_at               timestamptz not null default now(),
    -- NULL = persists forever (tutorial drops); otherwise auto-cleaned by a cron.
    expires_at               timestamptz
);

create index if not exists room_ground_items_room_idx
    on public.room_ground_items (room_id);

create index if not exists room_ground_items_visible_idx
    on public.room_ground_items (visible_to_character_id)
    where visible_to_character_id is not null;
