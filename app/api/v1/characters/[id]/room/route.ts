import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/characters/:id/room → current room with NPCs, connections,
 * and the localized name + description.
 *
 * Locale fold-in: pass ?locale=es and the response includes name_localized /
 * description_localized for the room and any NPCs.
 *
 * Side-effect: marks `character_room_visits` (first_visited_at + bumps
 * last_visited_at). Idempotent.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await resolveSession(req);
  if (!session.ok) return session.response;

  const url = new URL(req.url);
  const locale = url.searchParams.get("locale") ?? "en";

  const supabase = getSupabaseAdmin();

  // Verify ownership.
  const { data: character, error: charErr } = await supabase
    .from("characters")
    .select("id, user_id, current_room_id, current_floor")
    .eq("id", params.id)
    .eq("is_active", true)
    .maybeSingle();
  if (charErr) return NextResponse.json({ error: "DB_FAILED", detail: charErr.message }, { status: 500 });
  if (!character || character.user_id !== session.user.id) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // If the character has no current_room_id yet (just created), drop them in
  // floor 100 room 1 (The Crossing).
  let roomId = character.current_room_id as string | null;
  if (!roomId) {
    const { data: entry, error: entryErr } = await supabase
      .from("rooms")
      .select("id")
      .eq("floor_number", 100)
      .eq("room_index", 1)
      .is("character_id", null)
      .maybeSingle();
    if (entryErr) return NextResponse.json({ error: "DB_FAILED", detail: entryErr.message }, { status: 500 });
    if (!entry) return NextResponse.json({ error: "TUTORIAL_NOT_SEEDED" }, { status: 500 });
    roomId = entry.id as string;
    const { error: setErr } = await supabase
      .from("characters")
      .update({ current_room_id: roomId, current_floor: 100 })
      .eq("id", character.id);
    if (setErr) return NextResponse.json({ error: "DB_FAILED", detail: setErr.message }, { status: 500 });
  }

  // Fetch room + connections + npcs in parallel.
  const [roomRes, connRes, npcRes] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, floor_number, room_index, name, description, room_type, is_safe, biome_id")
      .eq("id", roomId)
      .single(),
    supabase
      .from("room_connections")
      .select("direction, to_room_id, is_locked, unlock_requirement")
      .eq("from_room_id", roomId),
    supabase.from("room_npcs").select("npc_id").eq("room_id", roomId),
  ]);

  if (roomRes.error) return NextResponse.json({ error: "DB_FAILED", detail: roomRes.error.message }, { status: 500 });
  if (connRes.error) return NextResponse.json({ error: "DB_FAILED", detail: connRes.error.message }, { status: 500 });
  if (npcRes.error) return NextResponse.json({ error: "DB_FAILED", detail: npcRes.error.message }, { status: 500 });

  const room = roomRes.data;
  const connections = connRes.data ?? [];
  const npcIds = (npcRes.data ?? []).map((r) => r.npc_id as string);

  // Hydrate NPCs.
  let npcs: Array<{
    id: string;
    name: string;
    title: string | null;
    portrait_url: string | null;
    has_unmet_first_dialogue: boolean;
    name_localized: string;
    title_localized: string | null;
  }> = [];
  if (npcIds.length > 0) {
    const [npcRowsRes, metRes] = await Promise.all([
      supabase
        .from("npcs")
        .select("id, name, title, portrait_url")
        .in("id", npcIds),
      supabase
        .from("character_npc_meets")
        .select("npc_id")
        .eq("character_id", character.id)
        .in("npc_id", npcIds),
    ]);
    if (npcRowsRes.error) return NextResponse.json({ error: "DB_FAILED", detail: npcRowsRes.error.message }, { status: 500 });
    const metSet = new Set((metRes.data ?? []).map((r) => r.npc_id as string));
    const npcRows = npcRowsRes.data ?? [];

    const tRows: Map<string, Record<string, string>> = new Map();
    if (locale !== "en") {
      const { data: tr } = await supabase
        .from("translations")
        .select("entity_id, field, value")
        .eq("entity_type", "npc")
        .eq("locale", locale)
        .in("entity_id", npcIds);
      for (const row of tr ?? []) {
        const entry = tRows.get(row.entity_id as string) ?? {};
        entry[row.field as string] = row.value as string;
        tRows.set(row.entity_id as string, entry);
      }
    }

    npcs = npcRows.map((n) => {
      const tr = tRows.get(n.id as string) ?? {};
      return {
        id: n.id as string,
        name: n.name as string,
        title: (n.title as string | null) ?? null,
        portrait_url: (n.portrait_url as string | null) ?? null,
        has_unmet_first_dialogue: !metSet.has(n.id as string),
        name_localized: tr.name ?? (n.name as string),
        title_localized: tr.title ?? (n.title as string | null) ?? null,
      };
    });
  }

  // Translate room name + description.
  let roomNameLocalized = room.name as string;
  let roomDescLocalized = (room.description as string | null) ?? null;
  if (locale !== "en") {
    const { data: rt } = await supabase
      .from("translations")
      .select("field, value")
      .eq("entity_type", "room")
      .eq("entity_id", roomId)
      .eq("locale", locale);
    for (const row of rt ?? []) {
      if (row.field === "name") roomNameLocalized = row.value as string;
      if (row.field === "description") roomDescLocalized = row.value as string;
    }
  }

  // Mark visit (idempotent: insert if missing, else bump last_visited_at).
  await supabase
    .from("character_room_visits")
    .upsert(
      {
        character_id: character.id,
        room_id: roomId,
        last_visited_at: new Date().toISOString(),
      },
      { onConflict: "character_id,room_id" },
    );

  return NextResponse.json({
    data: {
      room: {
        id: roomId,
        floor_number: room.floor_number,
        room_index: room.room_index,
        room_type: room.room_type,
        is_safe: room.is_safe,
        biome_id: room.biome_id,
        name: room.name,
        name_localized: roomNameLocalized,
        description: room.description,
        description_localized: roomDescLocalized,
      },
      connections: connections.map((c) => ({
        direction: c.direction,
        to_room_id: c.to_room_id,
        is_locked: c.is_locked,
        unlock_requirement: c.unlock_requirement,
      })),
      npcs,
    },
  });
}
