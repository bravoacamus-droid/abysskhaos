-- =============================================================================
-- Phase 4b — Combat sessions (server-authoritative turn-based combat)
--
-- Per active combat: snapshot of player + mob state, turn order, action
-- log. The client only POSTs intents (POST /combat/action with target
-- index); the server resolves damage from atk/def stored ON THIS ROW,
-- never the client's representation. Source of truth is the row.
--
-- Lifecycle:
--   - Created by /encounter/start when the cutscene fires.
--   - Mutated by /combat/action on every player decision (server also
--     resolves all mob counter-attacks in the same response so the
--     client never sees a "your turn" state during the AI sequence).
--   - is_over flips to true on victory OR defeat; outcome captures
--     which. After that the session is read-only; the React overlay
--     animates the log + closes.
--
-- Why a dedicated table vs encoding combat state into characters:
--   - A character can have at most one active session, but rows let
--     us KEEP terminal sessions for replay / debugging / leaderboards.
--   - JSONB mobs[] + turn_order[] + log[] keep the schema flat — no
--     need for combat_session_mobs join table for Phase 4b.
--   - The `is_over` partial unique index prevents two active sessions
--     for the same character (server enforces creating only when no
--     active session exists).
-- =============================================================================

create table if not exists public.combat_sessions (
    id              uuid primary key default gen_random_uuid(),
    character_id    uuid not null references public.characters(id) on delete cascade,
    encounter_id    text not null,
    /* Player vitals + offensive stats captured at session START.
       Subsequent /combat/action mutations bump player_hp here, NOT
       characters.hp_current — that update is deferred until victory
       (or set to full on defeat-respawn) so a player who quits the
       Telegram app mid-fight doesn't end up parked at 1 HP. */
    player_hp       integer not null,
    player_max_hp   integer not null,
    player_atk      integer not null,
    player_def      integer not null,
    /* mobs[]: [{
         id: 'centaur_warrior',
         name: 'Centaur Warrior',
         hp: 70, max_hp: 70,
         atk: 14, def: 8, exp: 80,
         alive: true,
       }, ...] */
    mobs            jsonb   not null,
    /* turn_order[]: [{kind:'player'}, {kind:'mob', idx:0}, {kind:'mob', idx:1}, ...]
       Cycles forever; turn_idx % length picks the actor. */
    turn_order      jsonb   not null,
    turn_idx        integer not null default 0,
    /* log[]: [{turn:0, actor:'player', target:'mob:0', dmg:12, kind:'attack'},
              {turn:1, actor:'mob:0', target:'player', dmg:6, kind:'attack'},
              {turn:N, actor:'mob:0', target:null, kind:'death'},
              {turn:M, kind:'victory', exp_awarded:150, khryn_awarded:30}] */
    log_entries     jsonb   not null default '[]'::jsonb,
    is_over         boolean not null default false,
    outcome         text check (outcome in ('victory', 'defeat')),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists combat_sessions_character_id_idx
    on public.combat_sessions (character_id);

-- One active combat per character at a time. Forces the encounter
-- endpoint to either return the existing session or refuse.
create unique index if not exists combat_sessions_one_active_per_character_idx
    on public.combat_sessions (character_id) where (is_over = false);
