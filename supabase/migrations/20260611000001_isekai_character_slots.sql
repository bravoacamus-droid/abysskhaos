-- =============================================================================
-- Isekai pivot — character slot cap 4 → 3
--
-- The isekai "second chance" design (docs/DESTINY_ENGINE.md) sets the
-- entitlement to: free = 1 character, paid = 3 (total 3). The Phase 2 schema
-- allowed 4 slots (free 2 + 2 USDT). This migration tightens the hard cap to 3:
--   - slot_index check: 1..4  →  1..3
--   - enforce_character_slot_limit trigger: >= 4  →  >= 3
--
-- The per-tier entitlement (free user limited to slot 1; slots 2-3 unlock with
-- payment in Phase 12) is enforced in the route handler, not here — the DB cap
-- is the last-line ceiling regardless of how many slots a user has paid for.
--
-- Forward-only: we never edit 20260507000003_phase2_characters_assets.sql.
-- =============================================================================

-- Tighten the slot_index range (inline check from Phase 2 is auto-named
-- `characters_slot_index_check`). Drop-and-re-add validates existing rows; at
-- this dev stage no character occupies slot 4.
alter table public.characters
    drop constraint if exists characters_slot_index_check;
alter table public.characters
    add constraint characters_slot_index_check check (slot_index between 1 and 3);

-- Lower the hard ceiling enforced on insert/update.
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
    if active_count >= 3 then
        raise exception 'character_slot_limit_exceeded' using errcode = 'P0001';
    end if;
    return new;
end;
$$;

-- Trigger definition is unchanged (still bound to the same function); no need to
-- recreate it.
