-- =============================================================================
-- ABYSS: KHAOS DESCENT — Phase 3c props table
-- =============================================================================
-- Stores reusable map decorations (doors, bridges, trees, dragons, portals).
-- Rooms reference props by id via `tilemap_data.props[i].kind`. The /room
-- endpoint joins on prop.id to ship sprite URLs + display metadata down to
-- the Phaser scene, which paints them on top of the tilemap.
--
-- Public read-only — props are part of the game content, no auth needed
-- to fetch their URLs.
-- =============================================================================

create table if not exists public.props (
    id text primary key,
    sprite_url text not null,
    /* Whether the player can walk through this prop's tile(s).
       Dragons + trees block; bridges + portals don't (the portal triggers
       a separate room transition that the scene wires up). */
    collision boolean not null default false,
    /* Multiplier on the rendered sprite size. Sprites come in mixed
       canvas sizes (64-128px); display_scale lets the placement decide
       how big it should sit on the tile grid. */
    display_scale real not null default 1.0,
    /* Free-form: width_tiles/height_tiles, glow color, tween hints, etc. */
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

alter table public.props enable row level security;

drop policy if exists "props readable to all" on public.props;
create policy "props readable to all"
    on public.props
    for select
    using (true);
