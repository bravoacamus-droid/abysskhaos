-- =============================================================================
-- Owner account: unlimited characters + ability to delete them.
--
-- A single account (the game owner's) gets to bypass the isekai character
-- entitlement so the owner can spin up / tear down test characters freely.
-- Everyone else stays on the normal rules (free = slot 1, hard cap = 3),
-- enforced in the route handler + the cap trigger below.
--
-- `is_owner` is set explicitly for the owner's telegram_id (separate statement
-- so it isn't part of the schema diff). Defaults false → no normal player ever
-- gains this by accident.
--
-- Forward-only.
-- =============================================================================

alter table public.users
    add column if not exists is_owner boolean not null default false;

-- Widen the slot_index sanity bound so the owner can hold many characters.
-- This is only a sanity cap — non-owners are still limited to slot 1 by the
-- route handler, so relaxing it grants normal players nothing.
alter table public.characters
    drop constraint if exists characters_slot_index_check;
alter table public.characters
    add constraint characters_slot_index_check check (slot_index between 1 and 99);

-- Skip the hard per-account cap for owner accounts; keep >= 3 for everyone
-- else (matches the isekai entitlement: free 1 + paid 2).
create or replace function public.enforce_character_slot_limit() returns trigger
language plpgsql as $$
declare
    active_count integer;
    owner boolean;
begin
    select coalesce(is_owner, false) into owner
    from public.users
    where id = new.user_id;
    if owner then
        return new;
    end if;
    select count(*) into active_count
    from public.characters
    where user_id = new.user_id
        and is_active
        and (TG_OP = 'INSERT' or id <> new.id);
    if active_count >= 3 then
        raise exception 'character_slot_limit_exceeded' using errcode = 'P0001';
    end if;
    return new;
end;
$$;
