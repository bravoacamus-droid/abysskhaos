import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildRoomStateForCharacter, roomStateErrorResponse } from "@/lib/server/room-state";
import {
  buildInitialCombatSession,
  type CombatSessionState,
} from "@/lib/server/combat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/characters/:id/encounter/start
 *   body: { encounter_id, locale? }
 *
 * Marks a scripted encounter as triggered for this character (so the
 * cutscene + combat flow can't replay every time the player walks
 * past the trigger tile) and returns the mob catalog data + fresh
 * RoomState. The client uses the mob data to render the placeholder
 * pre-combat modal in Phase 4a and the live combat scene in Phase 4b.
 *
 * Anti-cheat:
 *   - The encounter MUST exist on a prop in the character's current
 *     room (metadata.encounter_id matches). Without this a tampered
 *     client could "trigger" the same encounter from another floor
 *     to farm exp / skip content.
 *   - Mob ids come from the prop's metadata, NOT the request body —
 *     the client only sends `encounter_id` and the server resolves
 *     mob_ids from the DB.
 *   - Idempotent: re-fires return the same data, no double-spend.
 */

type Body = { encounter_id?: unknown; locale?: unknown };
type Tilemap = {
  props?: Array<{ kind: string; x: number; y: number }>;
};
type MobIdMeta = { encounter_id?: string; mob_ids?: string[] };

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await resolveSession(req);
  if (!session.ok) return session.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (typeof body.encounter_id !== "string") {
    return NextResponse.json({ error: "MISSING_ENCOUNTER_ID" }, { status: 400 });
  }
  const encounterId = body.encounter_id;

  const supabase = getSupabaseAdmin();

  const { data: character, error: charErr } = await supabase
    .from("characters")
    .select("id, user_id, current_room_id, seen_encounters, hp_current, hp_max, atk, def")
    .eq("id", params.id)
    .eq("is_active", true)
    .maybeSingle();
  if (charErr) return NextResponse.json({ error: "DB_FAILED", detail: charErr.message }, { status: 500 });
  if (!character || character.user_id !== session.user.id) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!character.current_room_id) {
    return NextResponse.json({ error: "NO_CURRENT_ROOM" }, { status: 409 });
  }

  // Resolve the encounter: find a prop in this room whose metadata
  // declares the named encounter_id. The prop is the source of truth
  // for mob_ids — client never sends the list.
  const { data: room, error: rErr } = await supabase
    .from("rooms")
    .select("tilemap_data")
    .eq("id", character.current_room_id)
    .single();
  if (rErr) return NextResponse.json({ error: "DB_FAILED", detail: rErr.message }, { status: 500 });
  const tilemap = (room.tilemap_data as Tilemap | null) ?? null;
  const propKinds = Array.from(new Set((tilemap?.props ?? []).map((p) => p.kind)));
  if (propKinds.length === 0) {
    return NextResponse.json({ error: "ENCOUNTER_NOT_IN_ROOM" }, { status: 404 });
  }
  const { data: propRows, error: pErr } = await supabase
    .from("props")
    .select("id, metadata")
    .in("id", propKinds);
  if (pErr) return NextResponse.json({ error: "DB_FAILED", detail: pErr.message }, { status: 500 });
  const matchingProp = (propRows ?? []).find(
    (r) => ((r.metadata as MobIdMeta | null)?.encounter_id ?? null) === encounterId,
  );
  if (!matchingProp) {
    return NextResponse.json({ error: "ENCOUNTER_NOT_IN_ROOM" }, { status: 404 });
  }
  const mobIds = ((matchingProp.metadata as MobIdMeta).mob_ids ?? []);
  if (mobIds.length === 0) {
    return NextResponse.json({ error: "ENCOUNTER_NO_MOBS" }, { status: 409 });
  }

  // Mark seen (idempotent — if already there, no-op).
  const seen = (character.seen_encounters as string[] | null) ?? [];
  if (!seen.includes(encounterId)) {
    const { error: markErr } = await supabase
      .from("characters")
      .update({ seen_encounters: [...seen, encounterId] })
      .eq("id", character.id);
    if (markErr) {
      return NextResponse.json({ error: "DB_FAILED", detail: markErr.message }, { status: 500 });
    }
  }

  // Load mob catalog data (stats + sprite atlas) for the cutscene +
  // future combat scene.
  const { data: monsterRows, error: mErr } = await supabase
    .from("monsters")
    .select("id, name, base_hp, base_atk, base_def, base_exp, sprite_atlas, animation_atlas")
    .in("id", mobIds);
  if (mErr) return NextResponse.json({ error: "DB_FAILED", detail: mErr.message }, { status: 500 });

  const locale = typeof body.locale === "string" ? body.locale : "en";
  let nameLocalized = new Map<string, string>();
  if (locale !== "en" && monsterRows && monsterRows.length > 0) {
    const { data: tr } = await supabase
      .from("translations")
      .select("entity_id, field, value")
      .eq("entity_type", "monster")
      .eq("locale", locale)
      .in("entity_id", mobIds);
    for (const row of tr ?? []) {
      if (row.field === "name") nameLocalized.set(row.entity_id as string, row.value as string);
    }
  }

  // Preserve the order the encounter declared so the client can place
  // them left-to-right consistently.
  const mobs = mobIds
    .map((id) => monsterRows?.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map((m) => ({
      id: m.id as string,
      name: m.name as string,
      name_localized: nameLocalized.get(m.id as string) ?? (m.name as string),
      hp_max: m.base_hp as number,
      atk: m.base_atk as number,
      def: m.base_def as number,
      exp: m.base_exp as number,
      sprite_atlas: (m.sprite_atlas as Record<string, string> | null) ?? null,
      animation_atlas:
        (m.animation_atlas as Record<string, Record<string, string[]>> | null) ?? null,
    }));

  const roomState = await buildRoomStateForCharacter(supabase, {
    characterId: character.id,
    userId: session.user.id,
    locale,
  });
  if (!roomState.ok) {
    const { status, body: errBody } = roomStateErrorResponse(roomState.error);
    return NextResponse.json(errBody, { status });
  }
  // Create the combat session (or return an active one if the user
  // somehow re-fires this endpoint mid-fight — the partial unique
  // index combat_sessions_one_active_per_character_idx enforces
  // at-most-one).
  const { data: existing } = await supabase
    .from("combat_sessions")
    .select("*")
    .eq("character_id", character.id)
    .eq("is_over", false)
    .maybeSingle();

  let combatSession: CombatSessionState | null = null;
  if (existing) {
    combatSession = {
      id: existing.id as string,
      encounter_id: existing.encounter_id as string,
      player_hp: existing.player_hp as number,
      player_max_hp: existing.player_max_hp as number,
      player_atk: existing.player_atk as number,
      player_def: existing.player_def as number,
      mobs: existing.mobs as CombatSessionState["mobs"],
      turn_order: existing.turn_order as CombatSessionState["turn_order"],
      turn_idx: existing.turn_idx as number,
      log_entries: existing.log_entries as CombatSessionState["log_entries"],
      is_over: existing.is_over as boolean,
      outcome: existing.outcome as CombatSessionState["outcome"],
    };
  } else {
    const initial = buildInitialCombatSession({
      encounterId,
      player: {
        hp_current: (character.hp_current as number | null) ?? 1,
        hp_max: (character.hp_max as number | null) ?? 1,
        atk: (character.atk as number | null) ?? 1,
        def: (character.def as number | null) ?? 0,
      },
      mobs: mobs.map((m) => ({
        id: m.id,
        name: m.name,
        hp_max: m.hp_max,
        atk: m.atk,
        def: m.def,
        exp: m.exp,
        sprite_atlas: m.sprite_atlas,
      })),
    });
    const { data: ins, error: insErr } = await supabase
      .from("combat_sessions")
      .insert({
        character_id: character.id,
        encounter_id: initial.encounter_id,
        player_hp: initial.player_hp,
        player_max_hp: initial.player_max_hp,
        player_atk: initial.player_atk,
        player_def: initial.player_def,
        mobs: initial.mobs,
        turn_order: initial.turn_order,
        turn_idx: initial.turn_idx,
        log_entries: initial.log_entries,
        is_over: initial.is_over,
        outcome: initial.outcome,
      })
      .select("*")
      .single();
    if (insErr) {
      return NextResponse.json({ error: "DB_FAILED", detail: insErr.message }, { status: 500 });
    }
    combatSession = {
      id: ins.id as string,
      encounter_id: ins.encounter_id as string,
      player_hp: ins.player_hp as number,
      player_max_hp: ins.player_max_hp as number,
      player_atk: ins.player_atk as number,
      player_def: ins.player_def as number,
      mobs: ins.mobs as CombatSessionState["mobs"],
      turn_order: ins.turn_order as CombatSessionState["turn_order"],
      turn_idx: ins.turn_idx as number,
      log_entries: ins.log_entries as CombatSessionState["log_entries"],
      is_over: ins.is_over as boolean,
      outcome: ins.outcome as CombatSessionState["outcome"],
    };
  }

  return NextResponse.json({
    data: {
      encounter_id: encounterId,
      mobs,
      combat_session: combatSession,
      room_state: roomState.data,
    },
  });
}
