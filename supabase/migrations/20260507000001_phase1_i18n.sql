-- =============================================================================
-- ABYSS: KHAOS DESCENT — Phase 1 i18n schema
-- =============================================================================
-- Adds the translation infrastructure required by the project i18n charter:
-- 10 locales must be supported from launch, Spanish canonical, others fallback.
-- Adding a new locale must NEVER require a schema migration (only INSERTs).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- supported_locales — single source of truth for which language codes are
-- accepted. The app reads this on cold-start and exposes them in the UI.
-- -----------------------------------------------------------------------------

create table if not exists public.supported_locales (
    id                  text primary key,
    name_native         text not null,
    name_en             text not null,
    is_canonical        boolean not null default false,
    is_active           boolean not null default true,
    sort_order          integer not null default 0,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    constraint only_one_canonical check (
        not is_canonical or true   -- enforced via partial unique below
    )
);

-- Exactly one canonical locale at a time. Partial unique on the bool itself.
create unique index if not exists supported_locales_one_canonical
    on public.supported_locales (is_canonical) where is_canonical;

-- -----------------------------------------------------------------------------
-- translations — generic i18n bag keyed by (entity_type, entity_id, locale, field).
-- Reads use COALESCE(translations, name_es) at the app layer.
-- -----------------------------------------------------------------------------

create table if not exists public.translations (
    entity_type     text not null,
    entity_id       text not null,
    locale          text not null references public.supported_locales(id) on delete cascade,
    field           text not null,
    value           text not null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    primary key (entity_type, entity_id, locale, field)
);

create index if not exists translations_lookup_idx
    on public.translations (entity_type, entity_id, locale);
create index if not exists translations_locale_idx
    on public.translations (locale);

-- -----------------------------------------------------------------------------
-- users.preferred_locale — let players override Telegram's language_code.
-- -----------------------------------------------------------------------------

alter table public.users
    add column if not exists preferred_locale text references public.supported_locales(id);

create index if not exists users_preferred_locale_idx
    on public.users (preferred_locale);

-- -----------------------------------------------------------------------------
-- Lockdown
-- -----------------------------------------------------------------------------

select public.lockdown_table('public.supported_locales');
select public.lockdown_table('public.translations');
