-- =============================================================================
-- Isekai pivot — Destiny Engine schema (docs/DESTINY_ENGINE.md)
--
-- Character creation is a server-side "destiny" roll from a 3-question quiz.
-- This migration adds the two NEW catalogs the roll assigns (companions,
-- passives) and the per-character columns that store the rolled build. The
-- `elements` catalog already exists (Phase 1) — only its seed changes (the 9
-- pivot elements), which is data, not schema.
--
-- Forward-only. Catalogs follow the established pattern: English canonical
-- name/description + i18n in `translations`, locked down then public-read for
-- display (like `classes`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- companions — the 23 pet families a character can be paired with at birth.
-- -----------------------------------------------------------------------------
create table if not exists public.companions (
    id          text primary key,
    name        text not null,
    description text,
    sort_order  integer not null default 0,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- passives — the 12 "pasivas del renacido". Each has 10 ranks; `value_r1` /
-- `value_r10` bound the linear scale, `effect` is the machine key the combat /
-- economy layer reads, `sign` is the display polarity (− for damage-taken / MP).
-- -----------------------------------------------------------------------------
create table if not exists public.passives (
    id          text primary key,
    name        text not null,
    description text,
    effect      text not null,
    value_r1    numeric(6,2) not null,
    value_r10   numeric(6,2) not null,
    sign        text not null default '+' check (sign in ('+', '-')),
    sort_order  integer not null default 0,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- characters — the rolled destiny. FKs are nullable so legacy rows created
-- before the engine stay valid; the rewritten POST handler always sets them.
-- `weapon_loadout_id` is the rolled initial-weapon slug (mapped to a real
-- Doc 7A item when the weapon catalog ships); kept as text for now.
-- `destiny_meta` audits the roll inputs (occupation/hobby/zodiac/age_band/seed)
-- without storing the raw birth date (only the year matters, via zodiac).
-- -----------------------------------------------------------------------------
alter table public.characters
    add column if not exists element_id        text references public.elements(id) on delete restrict,
    add column if not exists companion_id       text references public.companions(id) on delete restrict,
    add column if not exists passive_id          text references public.passives(id) on delete restrict,
    add column if not exists passive_rank        integer not null default 1 check (passive_rank between 1 and 10),
    add column if not exists weapon_loadout_id   text,
    add column if not exists destiny_meta        jsonb not null default '{}'::jsonb;

create index if not exists characters_element_idx   on public.characters (element_id);
create index if not exists characters_companion_idx on public.characters (companion_id);

-- -----------------------------------------------------------------------------
-- RLS: lock down (adds touch_updated_at trigger + deny-all) then public-read,
-- so the result screen can show localized catalog names like the class cards.
-- -----------------------------------------------------------------------------
select public.lockdown_table('public.companions');
select public.lockdown_table('public.passives');

drop policy if exists companions_no_anon_access on public.companions;
create policy companions_public_read on public.companions for select
    to anon, authenticated using (true);

drop policy if exists passives_no_anon_access on public.passives;
create policy passives_public_read on public.passives for select
    to anon, authenticated using (true);
