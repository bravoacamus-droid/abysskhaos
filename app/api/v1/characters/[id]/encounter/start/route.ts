import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildRoomStateForCharacter, roomStateErrorResponse } from "@/lib/server/room-state";

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
    .select("id, user_id, current_room_id, seen_encounters")
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
  return NextResponse.json({
    data: {
      encounter_id: encounterId,
      mobs,
      room_state: roomState.data,
    },
  });
}
