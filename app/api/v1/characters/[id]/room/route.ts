import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/characters/:id/room → everything the Phaser scene needs to
 * render the current room: tilemap data, biome tileset, NPC sprite atlases
 * + tile coordinates, the player's class sprite atlas, and the localized
 * room name + description for the banner overlay.
 *
 * Side-effect: marks `character_room_visits` (first_visited_at + bumps
 * last_visited_at).
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await resolveSession(req);
  if (!session.ok) return session.response;

  const url = new URL(req.url);
  const locale = url.searchParams.get("locale") ?? "en";

  const supabase = getSupabaseAdmin();

  const { data: character, error: charErr } = await supabase
    .from("characters")
    .select("id, user_id, current_room_id, current_floor, class_id, current_room_entry_dir")
    .eq("id", params.id)
    .eq("is_active", true)
    .maybeSingle();
  if (charErr) return NextResponse.json({ error: "DB_FAILED", detail: charErr.message }, { status: 500 });
  if (!character || character.user_id !== session.user.id) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Drop fresh characters in The Crossing (Floor 100, room 1) on first call.
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

  const [roomRes, connRes, npcRes, classRes, propsRes] = await Promise.all([
    supabase
      .from("rooms")
      .select(
        "id, floor_number, room_index, name, description, room_type, is_safe, biome_id, tilemap_data",
      )
      .eq("id", roomId)
      .single(),
    supabase
      .from("room_connections")
      .select("direction, to_room_id, is_locked, unlock_requirement")
      .eq("from_room_id", roomId),
    supabase
      .from("room_npcs")
      .select("npc_id, tile_x, tile_y")
      .eq("room_id", roomId),
    supabase
      .from("classes")
      .select("id, name, sprite_atlas, animation_atlas, portrait_url")
      .eq("id", character.class_id)
      .single(),
    supabase.from("props").select("id, sprite_url, collision, display_scale, metadata"),
  ]);

  if (roomRes.error) return NextResponse.json({ error: "DB_FAILED", detail: roomRes.error.message }, { status: 500 });
  if (connRes.error) return NextResponse.json({ error: "DB_FAILED", detail: connRes.error.message }, { status: 500 });
  if (npcRes.error) return NextResponse.json({ error: "DB_FAILED", detail: npcRes.error.message }, { status: 500 });
  if (classRes.error) return NextResponse.json({ error: "DB_FAILED", detail: classRes.error.message }, { status: 500 });
  if (propsRes.error) return NextResponse.json({ error: "DB_FAILED", detail: propsRes.error.message }, { status: 500 });

  const room = roomRes.data;
  const connections = connRes.data ?? [];
  const npcRowsByRoom = npcRes.data ?? [];
  const klass = classRes.data;
  const propRows = propsRes.data ?? [];
  const propsById = new Map(propRows.map((p) => [p.id as string, p]));

  // Hydrate room.tilemap_data.props with sprite_url / collision / scale
  // from the props table so the Phaser scene gets one self-contained
  // list per render. Unknown props (kind not in DB) are dropped silently.
  type TilemapProp = { kind: string; x: number; y: number };
  type HydratedProp = TilemapProp & {
    sprite_url: string;
    collision: boolean;
    display_scale: number;
    metadata: Record<string, unknown>;
  };
  type Direction = "north" | "south" | "east" | "west";
  type Tilemap = {
    width: number;
    height: number;
    spawn: { x: number; y: number };
    exits: Partial<Record<Direction, { x: number; y: number }>>;
    props?: TilemapProp[];
  };
  const tilemap = room.tilemap_data as Tilemap | null;
  const hydratedProps: HydratedProp[] = (tilemap?.props ?? [])
    .map((p) => {
      const def = propsById.get(p.kind);
      if (!def) return null;
      return {
        kind: p.kind,
        x: p.x,
        y: p.y,
        sprite_url: def.sprite_url as string,
        collision: def.collision as boolean,
        display_scale: (def.display_scale as number) ?? 1.0,
        metadata: (def.metadata as Record<string, unknown>) ?? {},
      };
    })
    .filter((p): p is HydratedProp => p !== null);

  // Override the default spawn with a tile next to the exit the player
  // just entered through, so crossing south → north feels coherent.
  // Step one tile *inward* from the entry exit (away from the wall it
  // sits on), avoiding immediate exit re-trigger.
  let spawnedTilemap = tilemap;
  if (tilemap && character.current_room_entry_dir) {
    const entryDir = character.current_room_entry_dir as Direction;
    const exit = tilemap.exits?.[entryDir];
    if (exit) {
      const inward = {
        north: { dx: 0, dy: 1 },
        south: { dx: 0, dy: -1 },
        east: { dx: -1, dy: 0 },
        west: { dx: 1, dy: 0 },
      }[entryDir];
      spawnedTilemap = {
        ...tilemap,
        spawn: { x: exit.x + inward.dx, y: exit.y + inward.dy },
      };
    }
  }

  // Biome tileset.
  let biome: { id: string; tileset_url: string | null; tileset_metadata: unknown } | null = null;
  if (room.biome_id) {
    const { data: biomeRow, error: bErr } = await supabase
      .from("biomes")
      .select("id, tileset_url, tileset_metadata")
      .eq("id", room.biome_id)
      .single();
    if (bErr) return NextResponse.json({ error: "DB_FAILED", detail: bErr.message }, { status: 500 });
    biome = biomeRow as unknown as { id: string; tileset_url: string | null; tileset_metadata: unknown };
  }

  // Hydrate NPCs.
  const npcIds = npcRowsByRoom.map((r) => r.npc_id as string);
  type RoomNpcOut = {
    id: string;
    name: string;
    title: string | null;
    portrait_url: string | null;
    sprite_atlas: Record<string, string> | null;
    animation_atlas: Record<string, Record<string, string[]>> | null;
    tile_x: number | null;
    tile_y: number | null;
    has_unmet_first_dialogue: boolean;
    name_localized: string;
    title_localized: string | null;
  };
  let npcs: RoomNpcOut[] = [];
  if (npcIds.length > 0) {
    const [npcRowsRes, metRes] = await Promise.all([
      supabase
        .from("npcs")
        .select("id, name, title, portrait_url, sprite_atlas, animation_atlas")
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

    const placementByNpc = new Map<string, { tile_x: number | null; tile_y: number | null }>();
    for (const row of npcRowsByRoom) {
      placementByNpc.set(row.npc_id as string, {
        tile_x: (row.tile_x as number | null) ?? null,
        tile_y: (row.tile_y as number | null) ?? null,
      });
    }

    npcs = npcRows.map((n) => {
      const tr = tRows.get(n.id as string) ?? {};
      const placement = placementByNpc.get(n.id as string) ?? { tile_x: null, tile_y: null };
      return {
        id: n.id as string,
        name: n.name as string,
        title: (n.title as string | null) ?? null,
        portrait_url: (n.portrait_url as string | null) ?? null,
        sprite_atlas: (n.sprite_atlas as Record<string, string> | null) ?? null,
        animation_atlas:
          (n.animation_atlas as Record<string, Record<string, string[]>> | null) ?? null,
        tile_x: placement.tile_x,
        tile_y: placement.tile_y,
        has_unmet_first_dialogue: !metSet.has(n.id as string),
        name_localized: tr.name ?? (n.name as string),
        title_localized: tr.title ?? (n.title as string | null) ?? null,
      };
    });
  }

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

  return NextResponse.json(
    {
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
          tilemap_data: spawnedTilemap,
        },
        biome,
        player: {
          class_id: klass.id,
          sprite_atlas: (klass.sprite_atlas as Record<string, string> | null) ?? null,
          animation_atlas:
            (klass.animation_atlas as Record<string, Record<string, string[]>> | null) ?? null,
          portrait_url: (klass.portrait_url as string | null) ?? null,
        },
        connections: connections.map((c) => ({
          direction: c.direction,
          to_room_id: c.to_room_id,
          is_locked: c.is_locked,
          unlock_requirement: c.unlock_requirement,
        })),
        npcs,
        props: hydratedProps,
      },
    },
    {
      // Telegram WebViews and the Cloudflare edge can both decide to
      // cache GET responses heuristically. The room state changes on
      // every reseed (and after the player moves), so any cache hit
      // means stale tilemap_data → mismatched walls → "no hay paso por
      // ahí" or "I can walk through walls". no-store prevents that.
      headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
    },
  );
}
