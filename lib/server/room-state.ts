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

import { buildAttributeBreakdown } from "./attributes";
import { computeEquippedBonuses } from "./stats";

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
      "id, user_id, current_room_id, current_floor, class_id, current_room_entry_dir, tutorial_step, name, level, exp, hp_current, hp_max, mp_current, mp_max, atk, def, attr_strength, attr_agility, attr_intelligence, attr_spirit, title_id, path_id, khryn, opened_props, seen_encounters",
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
  const groundRows = (groundRes.data ?? []);

  // Hydrate item catalog details (name, icon, type, stats) for every
  // unique item_id the character touches in this response. Saves the
  // client from doing N round-trips for "what does this item look
  // like" lookups.
  const allItemIds = new Set<string>();
  for (const r of itemRows) allItemIds.add(r.item_id);
  for (const g of groundRows) allItemIds.add(g.item_id as string);
  // Attribute / vital bonuses are exposed in the catalog so the
  // ItemDetailModal can render "+1 STR · +10 HP" alongside ATK / DEF,
  // and so the client's optimistic equip helper can apply the same
  // bonus deltas to the predicted stat sheet.
  type ItemBonuses = {
    bonus_str: number;
    bonus_agi: number;
    bonus_int: number;
    bonus_spi: number;
    bonus_hp: number;
    bonus_mp: number;
  };
  type ItemCatalogEntry = {
    id: string;
    name: string;
    name_localized: string;
    item_type: string;
    icon_path: string | null;
    weapon: ({ handedness: string; base_atk: number } & ItemBonuses) | null;
    armor: ({ slot: string; base_def: number } & ItemBonuses) | null;
    accessory: { slot: string } | null;
  };
  const BONUS_COLS = "bonus_str, bonus_agi, bonus_int, bonus_spi, bonus_hp, bonus_mp";
  function asBonuses(row: Record<string, unknown>): ItemBonuses {
    return {
      bonus_str: (row.bonus_str as number) ?? 0,
      bonus_agi: (row.bonus_agi as number) ?? 0,
      bonus_int: (row.bonus_int as number) ?? 0,
      bonus_spi: (row.bonus_spi as number) ?? 0,
      bonus_hp:  (row.bonus_hp  as number) ?? 0,
      bonus_mp:  (row.bonus_mp  as number) ?? 0,
    };
  }
  const catalog: Record<string, ItemCatalogEntry> = {};
  if (allItemIds.size > 0) {
    const ids = Array.from(allItemIds);
    const [mRes, wRes, aRes, acRes, tRes] = await Promise.all([
      supabase
        .from("items_master")
        .select("id, name, item_type, icon_path")
        .in("id", ids),
      supabase.from("weapons").select(`item_id, handedness, base_atk, ${BONUS_COLS}`).in("item_id", ids),
      supabase.from("armor").select(`item_id, slot, base_def, ${BONUS_COLS}`).in("item_id", ids),
      supabase.from("accessories").select("item_id, slot").in("item_id", ids),
      locale !== "en"
        ? supabase
            .from("translations")
            .select("entity_id, field, value")
            .eq("entity_type", "item")
            .eq("locale", locale)
            .in("entity_id", ids)
        : Promise.resolve({ data: [] as Array<{ entity_id: string; field: string; value: string }>, error: null }),
    ]);
    if (mRes.error) return { ok: false, error: { kind: "DB_FAILED", detail: mRes.error.message } };
    const wMap = new Map((wRes.data ?? []).map((w) => [w.item_id as string, w]));
    const aMap = new Map((aRes.data ?? []).map((a) => [a.item_id as string, a]));
    const acMap = new Map((acRes.data ?? []).map((ac) => [ac.item_id as string, ac]));
    const trMap = new Map<string, string>();
    for (const t of tRes.data ?? []) {
      if (t.field === "name") trMap.set(t.entity_id as string, t.value as string);
    }
    for (const m of mRes.data ?? []) {
      const id = m.id as string;
      const w = wMap.get(id);
      const a = aMap.get(id);
      const ac = acMap.get(id);
      catalog[id] = {
        id,
        name: m.name as string,
        name_localized: trMap.get(id) ?? (m.name as string),
        item_type: m.item_type as string,
        icon_path: (m.icon_path as string | null) ?? null,
        weapon: w
          ? { handedness: w.handedness as string, base_atk: w.base_atk as number, ...asBonuses(w as Record<string, unknown>) }
          : null,
        armor: a
          ? { slot: a.slot as string, base_def: a.base_def as number, ...asBonuses(a as Record<string, unknown>) }
          : null,
        accessory: ac ? { slot: ac.slot as string } : null,
      };
    }
  }

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

  // Equipped bonuses (attr + vital gear bonuses) folded into effective
  // values that the UI surfaces. We DON'T persist these to the
  // characters row — base attrs / hp_max stay there and level-up logic
  // can mutate them simply, with gear bonuses layered live per render.
  const equipBonuses = await computeEquippedBonuses(supabase, character.id);

  const baseStrength      = (character.attr_strength      as number | null) ?? 0;
  const baseAgility       = (character.attr_agility       as number | null) ?? 0;
  const baseIntelligence  = (character.attr_intelligence  as number | null) ?? 0;
  const baseSpirit        = (character.attr_spirit        as number | null) ?? 0;
  const baseHpMax         = (character.hp_max             as number | null) ?? 0;
  const baseMpMax         = (character.mp_max             as number | null) ?? 0;

  const effStrength     = baseStrength     + equipBonuses.bonus_str;
  const effAgility      = baseAgility      + equipBonuses.bonus_agi;
  const effIntelligence = baseIntelligence + equipBonuses.bonus_int;
  const effSpirit       = baseSpirit       + equipBonuses.bonus_spi;
  const effHpMax        = baseHpMax        + equipBonuses.bonus_hp;
  const effMpMax        = baseMpMax        + equipBonuses.bonus_mp;

  // Attribute breakdown: 4 primaries with their 5 sub-attributes each,
  // names localized, derived values computed from EFFECTIVE primary
  // attrs (so the sub-attr numbers reflect equipped gear too).
  const attributesBreakdown = await buildAttributeBreakdown(
    supabase,
    {
      attr_strength: effStrength,
      attr_agility: effAgility,
      attr_intelligence: effIntelligence,
      attr_spirit: effSpirit,
    },
    locale,
  );

  const groundItems = groundRows.map((g) => ({
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
        class_name: klass.name as string,
        sprite_atlas: (klass.sprite_atlas as Record<string, string> | null) ?? null,
        animation_atlas:
          (klass.animation_atlas as Record<string, Record<string, string[]>> | null) ?? null,
        portrait_url: (klass.portrait_url as string | null) ?? null,
        tutorial_step: (character.tutorial_step as string | null) ?? "complete",
        // Full character profile + combat stats — exposed so the
        // Equip / Stats panels can render without extra round-trips.
        name: (character.name as string | null) ?? "",
        level: (character.level as number | null) ?? 1,
        exp: (character.exp as number | null) ?? 0,
        hp_current: (character.hp_current as number | null) ?? 0,
        hp_max: (character.hp_max as number | null) ?? 0,
        mp_current: (character.mp_current as number | null) ?? 0,
        mp_max: (character.mp_max as number | null) ?? 0,
        atk: (character.atk as number | null) ?? 0,
        def: (character.def as number | null) ?? 0,
        // Base values from the character row (level-up writes here).
        attr_strength: baseStrength,
        attr_agility: baseAgility,
        attr_intelligence: baseIntelligence,
        attr_spirit: baseSpirit,
        // Effective values = base + Σ(equipped bonuses). UI shows
        // these as "13 (+1)" so the player can see what gear adds.
        effective_attr_strength: effStrength,
        effective_attr_agility: effAgility,
        effective_attr_intelligence: effIntelligence,
        effective_attr_spirit: effSpirit,
        hp_max_effective: effHpMax,
        mp_max_effective: effMpMax,
        equipped_bonuses: equipBonuses,
        title_id: (character.title_id as string | null) ?? null,
        path_id: (character.path_id as string | null) ?? null,
        khryn: (character.khryn as number | null) ?? 0,
        // Per-character record of which interactable props this
        // character has already opened. Key format:
        //   `${room_id}:${prop_kind}:${tile_x}:${tile_y}`
        // The scene reads this to render the "opened" variant of
        // the chest sprite + suppress the Z interact prompt.
        opened_props: ((character.opened_props as string[] | null) ?? []),
        // Per-character record of scripted encounters that have
        // ALREADY fired (centaur+archer ambush, future cutscenes).
        // The scene checks this before firing an encounter trigger
        // so the cutscene doesn't replay every time the player
        // walks past the same tile.
        seen_encounters: ((character.seen_encounters as string[] | null) ?? []),
      },
      inventory,
      equipped,
      ground_items: groundItems,
      item_catalog: catalog,
      connections: connections.map((c) => ({
        direction: c.direction,
        to_room_id: c.to_room_id,
        is_locked: c.is_locked,
        unlock_requirement: c.unlock_requirement,
      })),
      npcs,
      props: hydratedProps,
      background_tile_url: backgroundTileUrl,
      attributes_breakdown: attributesBreakdown,
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
