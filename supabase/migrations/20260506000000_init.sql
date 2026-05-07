-- ABYSS: KHAOS DESCENT — Phase 0 init schema
-- Minimal `users` table keyed by Telegram ID. Phase 1 will add the canonical
-- game tables (classes, items, monsters, …).

create extension if not exists "pgcrypto";

create table if not exists public.users (
    id              uuid primary key default gen_random_uuid(),
    telegram_id     bigint unique not null,
    first_name      text   not null,
    last_name       text,
    username        text,
    language_code   text,
    is_premium      boolean not null default false,
    photo_url       text,
    created_at      timestamptz not null default now(),
    last_seen_at    timestamptz not null default now()
);

create index if not exists users_telegram_id_idx on public.users (telegram_id);

-- Touch updated_at-like field on every UPDATE.
create or replace function public.touch_last_seen() returns trigger
language plpgsql as $$
begin
    new.last_seen_at = now();
    return new;
end;
$$;

drop trigger if exists users_touch_last_seen on public.users;
create trigger users_touch_last_seen
    before update on public.users
    for each row execute function public.touch_last_seen();

-- RLS: deny-all to anon/authenticated. Server-side service-role bypasses RLS.
-- Phase 2 will introduce a per-user JWT (telegram_id claim) so the client can
-- read its own row directly with a sane policy.
alter table public.users enable row level security;

drop policy if exists users_no_anon_access on public.users;
create policy users_no_anon_access on public.users for all
    to anon, authenticated
    using (false) with check (false);
