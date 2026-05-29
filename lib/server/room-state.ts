/**
 * Shared room-state builder used by GET /room and POST /move.
 *
 * Centralising it here means /move can return the next room in the same
 * HTTP round-trip instead of forcing the client to do POST + GET back
 * to back — that was adding ~150-250 ms of perceived "wait" between
 * stepping on the door and seeing the next room.
 *
 * Throws on character/room not found so callers can branch on error.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type RoomStateBuildError =
  | { kind: "NOT_FOUND" }
  | { kind: "TUTORIAL_NOT_SEEDED" }
  | { kind: "DB_FAILED"; detail: string };

export type RoomStateResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: RoomStateBuildError };

type Direction = "north" | "south" | "east" | "west";
type TilemapProp = { kind: string; x: number; y: number };
type Tilemap = {
  width: number;
  height: number;
  spawn: { x: number; y: number };
  exits: Partial<Record<Direction, { x: number; y: number }>>;
  props?: TilemapProp[];
};

export async function buildRoomStateForCharacter(
  supabase: SupabaseClient,
  options: { characterId: string; userId: string; locale: string },
): Promise<RoomStateResult> {
  const { characterId, userId, locale } = options;

  const { data: character, error: charErr } = await supabase
    .from("characters")
    .select(
      "id, user_id, current_room_id, current_floor, class_id, current_room_entry_dir, tutorial_step",
    )
    .eq("id", characterId)
    .eq("is_active", true)
    .maybeSingle();
  if (charErr) return { ok: false, error: { kind: "DB_FAILED", detail: charErr.message } };
  if (!character || character.user_id !== userId) {
    return { ok: false, error: { kind: "NOT_FOUND" } };
  }

  let roomId = character.current_room_id as string | null;
  if (!roomId) {
    const { data: entry, error: entryErr } = await supabase
      .from("rooms")
      .select("id")
      .eq("floor_number", 100)
      .eq("room_index", 1)
      .is("character_id", null)
      .maybeSingle();
    if (entryErr) return { ok: false, error: { kind: "DB_FAILED", detail: entryErr.message } };
    if (!entry) return { ok: false, error: { kind: "TUTORIAL_NOT_SEEDED" } };
    roomId = entry.id as string;
    const { error: setErr } = await supabase
      .from("characters")
      .update({ current_room_id: roomId, current_floor: 100 })
      .eq("id", character.id);
    if (setErr) return { ok: false, error: { kind: "DB_FAILED", detail: setErr.message } };
  }

  const [roomRes, connRes, npcRes, classRes, propsRes, itemsRes, groundRes] =
    await Promise.all([
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
      // Character's items (inventory grid + equipped slots in one query).
      supabase
        .from("character_items")
        .select("id, item_id, inventory_slot, equipped_slot, quantity, durability, metadata")
        .eq("character_id", character.id),
      // Loose items lying on the floor in the current room, visible to this
      // character (NULL = public, otherwise scoped to a single character —
      // tutorial drops use this scoping so other players never see them).
      supabase
        .from("room_ground_items")
        .select("id, item_id, position_x, position_y, quantity, metadata, visible_to_character_id")
        .eq("room_id", roomId)
        .or(`visible_to_character_id.is.null,visible_to_character_id.eq.${character.id}`),
    ]);

  if (roomRes.error) return { ok: false, error: { kind: "DB_FAILED", detail: roomRes.error.message } };
  if (connRes.error) return { ok: false, error: { kind: "DB_FAILED", detail: connRes.error.message } };
  if (npcRes.error) return { ok: false, error: { kind: "DB_FAILED", detail: npcRes.error.message } };
  if (classRes.error) return { ok: false, error: { kind: "DB_FAILED", detail: classRes.error.message } };
  if (propsRes.error) return { ok: false, error: { kind: "DB_FAILED", detail: propsRes.error.message } };
  if (itemsRes.error) return { ok: false, error: { kind: "DB_FAILED", detail: itemsRes.error.message } };
  if (groundRes.error) return { ok: false, error: { kind: "DB_FAILED", detail: groundRes.error.message } };

  const room = roomRes.data;
  const connections = connRes.data ?? [];
  const npcRowsByRoom = npcRes.data ?? [];
  const klass = classRes.data;
  const propRows = propsRes.data ?? [];
  const propsById = new Map(propRows.map((p) => [p.id as string, p]));

  // A prop tagged metadata.role === "background" is used as the
  // tileable halo around the playable area (the dark cave wall the
  // player sees beyond the map). One per biome by convention.
  const backgroundProp = propRows.find(
    (p) => (p.metadata as { role?: string } | null)?.role === "background",
  );
  const backgroundTileUrl = (backgroundProp?.sprite_url as string | undefined) ?? null;

  type HydratedProp = TilemapProp & {
    sprite_url: string;
    collision: boolean;
    display_scale: number;
    metadata: Record<string, unknown>;
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

  let biome: { id: string; tileset_url: string | null; tileset_metadata: unknown } | null = null;
  if (room.biome_id) {
    const { data: biomeRow, error: bErr } = await supabase
      .from("biomes")
      .select("id, tileset_url, tileset_metadata")
      .eq("id", room.biome_id)
      .single();
    if (bErr) return { ok: false, error: { kind: "DB_FAILED", detail: bErr.message } };
    biome = biomeRow as unknown as { id: string; tileset_url: string | null; tileset_metadata: unknown };
  }

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
    if (npcRowsRes.error) return { ok: false, error: { kind: "DB_FAILED", detail: npcRowsRes.error.message } };
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

  // Fire-and-forget visit upsert; we don't block the response on it.
  void supabase
    .from("character_room_visits")
    .upsert(
      {
        character_id: character.id,
        room_id: roomId,
        last_visited_at: new Date().toISOString(),
      },
      { onConflict: "character_id,room_id" },
    );

  // Split the character_items rows into inventory vs equipped buckets.
  type RawItem = {
    id: string;
    item_id: string;
    inventory_slot: number | null;
    equipped_slot: string | null;
    quantity: number;
    durability: number | null;
    metadata: Record<string, unknown>;
  };
  const itemRows = (itemsRes.data ?? []) as RawItem[];
  const inventory = itemRows
    .filter((r) => r.inventory_slot !== null)
    .map((r) => ({
      id: r.id,
      item_id: r.item_id,
      slot: r.inventory_slot as number,
      quantity: r.quantity,
      durability: r.durability,
      metadata: r.metadata,
    }));
  const equipped = itemRows
    .filter((r) => r.equipped_slot !== null)
    .map((r) => ({
      id: r.id,
      item_id: r.item_id,
      slot: r.equipped_slot as string,
      quantity: r.quantity,
      durability: r.durability,
      metadata: r.metadata,
    }));

  const groundItems = (groundRes.data ?? []).map((g) => ({
    id: g.id as string,
    item_id: g.item_id as string,
    x: g.position_x as number,
    y: g.position_y as number,
    quantity: (g.quantity as number) ?? 1,
    metadata: (g.metadata as Record<string, unknown>) ?? {},
  }));

  return {
    ok: true,
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
        tutorial_step: (character.tutorial_step as string | null) ?? "complete",
      },
      inventory,
      equipped,
      ground_items: groundItems,
      connections: connections.map((c) => ({
        direction: c.direction,
        to_room_id: c.to_room_id,
        is_locked: c.is_locked,
        unlock_requirement: c.unlock_requirement,
      })),
      npcs,
      props: hydratedProps,
      background_tile_url: backgroundTileUrl,
    },
  };
}

export function roomStateErrorResponse(
  err: RoomStateBuildError,
): { status: number; body: { error: string; detail?: string } } {
  switch (err.kind) {
    case "NOT_FOUND":
      return { status: 404, body: { error: "NOT_FOUND" } };
    case "TUTORIAL_NOT_SEEDED":
      return { status: 500, body: { error: "TUTORIAL_NOT_SEEDED" } };
    case "DB_FAILED":
      return { status: 500, body: { error: "DB_FAILED", detail: err.detail } };
  }
}
