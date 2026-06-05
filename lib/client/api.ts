/**
 * Browser-side API helpers. Every authenticated call MUST send the Telegram
 * initData via the `x-telegram-init-data` header so the server can verify
 * HMAC freshness on each request (Phase 7 will move this to a session
 * cookie).
 */

import { TELEGRAM_INIT_DATA_HEADER } from "@/lib/auth/session";

type FetchOpts = {
  initData: string;
  signal?: AbortSignal;
};

async function call<T>(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  opts: FetchOpts & { body?: unknown },
): Promise<T> {
  const headers: Record<string, string> = {
    [TELEGRAM_INIT_DATA_HEADER]: opts.initData,
  };
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, { method, headers, body, signal: opts.signal });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    // leave null
  }
  if (!res.ok) {
    const errBody = parsed as { error?: string; detail?: string } | null;
    const code = errBody?.error ?? `HTTP_${res.status}`;
    throw new ApiError(code, errBody?.detail, res.status);
  }
  return (parsed as { data: T }).data;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly detail: string | undefined,
    public readonly status: number,
  ) {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.name = "ApiError";
  }
}

export type ClassRow = {
  id: string;
  name: string;
  description: string;
  primary_attr_a_id: string;
  primary_attr_b_id: string;
  starting_hp: number;
  starting_mp: number;
  starting_atk: number;
  starting_def: number;
  sort_order: number;
  portrait_url: string | null;
  name_localized: string;
  description_localized: string;
};

export type CharacterRow = {
  id: string;
  slot_index: number;
  name: string;
  class_id: string;
  level: number;
  exp: number;
  hp_current: number;
  hp_max: number;
  mp_current: number;
  mp_max: number;
  atk: number;
  def: number;
  attr_strength: number;
  attr_agility: number;
  attr_intelligence: number;
  attr_spirit: number;
  current_floor: number | null;
  created_at: string;
};

export async function fetchClasses(opts: FetchOpts & { locale: string }): Promise<ClassRow[]> {
  // /api/v1/classes is a public endpoint but we still pass initData so the
  // session resolver can attribute the request later.
  const res = await fetch(`/api/v1/classes?locale=${encodeURIComponent(opts.locale)}`, {
    signal: opts.signal,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw new ApiError(body.error ?? `HTTP_${res.status}`, body.detail, res.status);
  }
  return ((await res.json()) as { data: ClassRow[] }).data;
}

export function fetchCharacters(opts: FetchOpts): Promise<CharacterRow[]> {
  return call("/api/v1/characters", "GET", opts);
}

export function createCharacter(
  opts: FetchOpts & { name: string; classId: string; slotIndex?: number },
): Promise<CharacterRow> {
  return call("/api/v1/characters", "POST", {
    initData: opts.initData,
    body: { name: opts.name, class_id: opts.classId, slot_index: opts.slotIndex },
    signal: opts.signal,
  });
}

export function updatePreferredLocale(opts: FetchOpts & { locale: string }): Promise<{ locale: string }> {
  return call("/api/v1/me/locale", "PATCH", {
    initData: opts.initData,
    body: { locale: opts.locale },
    signal: opts.signal,
  });
}

export type Direction = "north" | "south" | "east" | "west";

export type SpriteAtlas = Partial<Record<Direction, string>>;

/**
 * Per-animation, per-direction frame URL list. PixelLab walk + idle each
 * yield 4 frames per direction. Phaser composes one Phaser.Animation per
 * (animation × direction) and switches based on movement state.
 */
export type AnimationAtlas = Partial<Record<"walk" | "idle", Partial<Record<Direction, string[]>>>>;

export type RoomNpc = {
  id: string;
  name: string;
  title: string | null;
  portrait_url: string | null;
  sprite_atlas: SpriteAtlas | null;
  animation_atlas: AnimationAtlas | null;
  tile_x: number | null;
  tile_y: number | null;
  has_unmet_first_dialogue: boolean;
  name_localized: string;
  title_localized: string | null;
};

export type RoomConnectionRow = {
  direction: Direction;
  to_room_id: string;
  is_locked: boolean;
  unlock_requirement: string | null;
};

export type TilemapData = {
  width: number;
  height: number;
  tiles: string[];
  spawn: { x: number; y: number };
  exits: Partial<Record<Direction, { x: number; y: number }>>;
  props?: Array<{ kind: string; x: number; y: number }>;
};

export type WangTileMeta = {
  id: string;
  corners: {
    NW: "upper" | "lower";
    NE: "upper" | "lower";
    SW: "upper" | "lower";
    SE: "upper" | "lower";
  };
  bounding_box: { x: number; y: number; width: number; height: number };
};

/**
 * The actual shape returned by PixelLab's MCP /metadata endpoint. The
 * tile array lives under `tileset_data.tiles`, not at the root — their
 * documented JSON example flattens it for clarity. Keep both possible
 * locations here so consumers can be lenient.
 */
export type WangTilesetMeta = {
  format: string;
  tileset_image: { filename: string; dimensions: { width: number; height: number } };
  tile_size?: { width: number; height: number };
  /** Modern shape from MCP metadata. */
  tileset_data?: { tiles: WangTileMeta[] };
  /** Legacy shape (and for hand-authored tilesets). */
  tiles?: WangTileMeta[];
};

export type RoomProp = {
  kind: string;
  x: number;
  y: number;
  sprite_url: string;
  collision: boolean;
  display_scale: number;
  metadata: Record<string, unknown>;
};

/** Where the player is in the first-login tutorial. 'complete' = free play. */
export type TutorialStep =
  | "walk_to_cedric"
  | "after_dialogue"
  | "pickup_sword"
  | "equip_sword"
  | "complete";

/** Equipped slot keys — must match the CHECK constraint in
 *  `20260528000001_phase3d_inventory_tutorial.sql`. */
export type EquippedSlot =
  | "main_hand"
  | "off_hand"
  | "armor_head"
  | "armor_chest"
  | "armor_arms"
  | "armor_legs"
  | "armor_feet"
  | "accessory_ring_1"
  | "accessory_ring_2"
  | "accessory_amulet";

export type CharacterItem = {
  /** UUID of the character_items row (per-instance, NOT the catalog item_id). */
  id: string;
  /** Catalog item id (items_master.id). */
  item_id: string;
  /** For inventory items: 0-39 grid slot. For equipped items: the slot key. */
  slot: number | EquippedSlot;
  quantity: number;
  durability: number | null;
  metadata: Record<string, unknown>;
};

export type GroundItem = {
  /** UUID of the room_ground_items row. */
  id: string;
  item_id: string;
  x: number;
  y: number;
  quantity: number;
  metadata: Record<string, unknown>;
};

export type ItemBonuses = {
  bonus_str: number;
  bonus_agi: number;
  bonus_int: number;
  bonus_spi: number;
  bonus_hp: number;
  bonus_mp: number;
};

export type ItemCatalogEntry = {
  id: string;
  name: string;
  name_localized: string;
  item_type: "weapon" | "armor" | "accessory" | "consumable" | "gem" | "quest" | "misc";
  icon_path: string | null;
  weapon: ({ weapon_class: string; handedness: string; base_atk: number } & ItemBonuses) | null;
  armor: ({ slot: string; base_def: number } & ItemBonuses) | null;
  accessory: { slot: string } | null;
};

export type RoomState = {
  room: {
    id: string;
    floor_number: number;
    room_index: number;
    room_type: string;
    is_safe: boolean;
    biome_id: string | null;
    name: string;
    name_localized: string;
    description: string | null;
    description_localized: string | null;
    tilemap_data: TilemapData | null;
  };
  biome: {
    id: string;
    tileset_url: string | null;
    tileset_metadata: WangTilesetMeta | null;
  } | null;
  player: {
    class_id: string;
    class_name: string;
    sprite_atlas: SpriteAtlas | null;
    animation_atlas: AnimationAtlas | null;
    /** Side-view combat sprite atlas for the CombatOverlay. Distinct
     *  from sprite_atlas (top-down exploration). Falls back to the
     *  top-down sprite when null. */
    combat_sprite_atlas: Record<string, string> | null;
    combat_animation_atlas: Record<string, Record<string, string[]>> | null;
    portrait_url: string | null;
    tutorial_step: TutorialStep;
    // Full character profile + combat stats — used by the inventory /
    // stats panels. Server-authoritative so the UI never goes out of
    // sync with the actual character row.
    name: string;
    level: number;
    exp: number;
    hp_current: number;
    hp_max: number;
    mp_current: number;
    mp_max: number;
    atk: number;
    def: number;
    /** Base primary attrs (from the characters row — level-up writes
     *  to these). For display, prefer `effective_attr_*` which folds
     *  in equipped gear bonuses. */
    attr_strength: number;
    attr_agility: number;
    attr_intelligence: number;
    attr_spirit: number;
    /** Base + Σ(equipped bonus_<attr>). Used by Atributos tab as the
     *  "current" value and by the sub-attribute breakdown to derive
     *  numbers like crit chance / evasion. */
    effective_attr_strength: number;
    effective_attr_agility: number;
    effective_attr_intelligence: number;
    effective_attr_spirit: number;
    /** Effective HP/MP max = character base + Σ(equipped bonus_hp/mp). */
    hp_max_effective: number;
    mp_max_effective: number;
    /** Per-stat gear contribution. Lets the UI render "(+1)" next to
     *  the primary attr value or the small bonus annotations on stat
     *  sheets without re-summing item_catalog data. */
    equipped_bonuses: {
      atk: number; def: number;
      bonus_str: number; bonus_agi: number; bonus_int: number; bonus_spi: number;
      bonus_hp: number; bonus_mp: number;
    };
    title_id: string | null;
    path_id: string | null;
    khryn: number;
    /** Composite keys of every prop this character has already
     *  triggered. Format: `${room_id}:${prop_kind}:${tile_x}:${tile_y}`.
     *  Used by the scene to render the "opened" chest variant + skip
     *  the Z interact prompt for already-opened chests. */
    opened_props: string[];
    /** Encounter IDs that have ALREADY fired for this character. The
     *  scene suppresses re-trigger on tiles whose encounter_id is in
     *  this set. Format is the encounter_id string the prop declares
     *  in metadata. */
    seen_encounters: string[];
  };
  /** Items in the character's backpack grid (slot 0-39). */
  inventory: CharacterItem[];
  /** Items currently equipped in slot_type slots. */
  equipped: CharacterItem[];
  /** Loose items lying on the floor in the current room, visible to this char. */
  ground_items: GroundItem[];
  /** Catalog entries for every item_id referenced in inventory/equipped/
   *  ground_items above. Lets the UI render names + icons + stats without
   *  N+1 round-trips. Keyed by item_id. */
  item_catalog: Record<string, ItemCatalogEntry>;
  connections: RoomConnectionRow[];
  npcs: RoomNpc[];
  props: RoomProp[];
  /** Tileable PNG painted as the cave wall halo beyond the playable area. */
  background_tile_url: string | null;
  /** Server-computed: 4 primaries with localized name + value, each
   *  with its 5 sub-attributes (name, description, derived value where
   *  coefficient exists in the seed). Pure read-only — coefficients
   *  live server-side, derived values are pre-multiplied. */
  attributes_breakdown: AttributeBreakdownGroup[];
};

export type SubAttributeBreakdown = {
  id: string;
  name_localized: string;
  description_localized: string | null;
  /** Null while balance pass is pending (most rows today). */
  effect_per_point: number | null;
  /** Unit hint: 'pct', 'atk_flat', 'hp_flat', 'mp_flat', 'hp_per_turn',
   *  'mp_per_turn', 'def_flat', 'matk_flat', 'pct_drop_chance',
   *  'turn_order', 'weight' — drives display formatting in the UI. */
  effect_unit: string | null;
  /** Null when effect_per_point is null; otherwise primary * coeff. */
  derived_value: number | null;
};

export type AttributeBreakdownGroup = {
  id: string;
  abbrev: string;
  name_localized: string;
  description_localized: string | null;
  /** Primary attr score from the character row. */
  value: number;
  sub_attributes: SubAttributeBreakdown[];
};

export type DialogueLine = {
  id: string;
  sequence_index: number;
  speaker: "npc" | "narrator" | "choice";
  text: string;
  text_localized: string;
};

export type DialoguePayload = {
  dialogue_key: string;
  lines: DialogueLine[];
};

export function fetchRoom(opts: FetchOpts & { characterId: string; locale: string }): Promise<RoomState> {
  // Cache-bust with a timestamp so Telegram WebView and intermediate
  // proxies can never hand back a stale tilemap. The server already
  // sends `Cache-Control: no-store`, but some webviews honour their own
  // heuristic cache when the URL hasn't changed across calls — adding
  // _t=Date.now() guarantees the URL is unique per request.
  const t = Date.now();
  return call(
    `/api/v1/characters/${opts.characterId}/room?locale=${encodeURIComponent(opts.locale)}&_t=${t}`,
    "GET",
    { initData: opts.initData, signal: opts.signal },
  );
}

export function moveCharacter(
  opts: FetchOpts & { characterId: string; direction: Direction; locale: string },
): Promise<{ current_room_id: string; current_floor: number; room_state: RoomState }> {
  return call(`/api/v1/characters/${opts.characterId}/move`, "POST", {
    initData: opts.initData,
    body: { direction: opts.direction, locale: opts.locale },
    signal: opts.signal,
  });
}

export function fetchDialogue(
  opts: FetchOpts & { characterId: string; npcId: string; locale: string },
): Promise<DialoguePayload> {
  return call(
    `/api/v1/characters/${opts.characterId}/dialogue/${opts.npcId}?locale=${encodeURIComponent(opts.locale)}`,
    "GET",
    { initData: opts.initData, signal: opts.signal },
  );
}

export function markDialogueRead(
  opts: FetchOpts & { characterId: string; npcId: string },
): Promise<{ ok: boolean; tutorial_step: TutorialStep | null }> {
  return call(`/api/v1/characters/${opts.characterId}/dialogue/${opts.npcId}`, "POST", {
    initData: opts.initData,
    signal: opts.signal,
  });
}

export function pickupGroundItem(
  opts: FetchOpts & { characterId: string; groundItemId: string; locale: string },
): Promise<{ room_state: RoomState }> {
  return call(`/api/v1/characters/${opts.characterId}/pickup`, "POST", {
    initData: opts.initData,
    body: { ground_item_id: opts.groundItemId, locale: opts.locale },
    signal: opts.signal,
  });
}

export function equipItem(
  opts: FetchOpts & {
    characterId: string;
    characterItemId: string;
    slot: EquippedSlot;
    locale: string;
  },
): Promise<{ room_state: RoomState }> {
  return call(`/api/v1/characters/${opts.characterId}/equip`, "POST", {
    initData: opts.initData,
    body: {
      character_item_id: opts.characterItemId,
      slot: opts.slot,
      locale: opts.locale,
    },
    signal: opts.signal,
  });
}

export function unequipItem(
  opts: FetchOpts & { characterId: string; characterItemId: string; locale: string },
): Promise<{ room_state: RoomState }> {
  return call(`/api/v1/characters/${opts.characterId}/unequip`, "POST", {
    initData: opts.initData,
    body: { character_item_id: opts.characterItemId, locale: opts.locale },
    signal: opts.signal,
  });
}

export type InteractReward = {
  message_key: string;
  items: Array<{ item_id: string; quantity?: number }>;
};

export type EncounterMob = {
  id: string;
  name: string;
  name_localized: string;
  hp_max: number;
  atk: number;
  def: number;
  exp: number;
  sprite_atlas: Record<string, string> | null;
  animation_atlas: Record<string, Record<string, string[]>> | null;
  combat_sprite_atlas: Record<string, string> | null;
  combat_animation_atlas: Record<string, Record<string, string[]>> | null;
};

export type CombatMobState = {
  id: string;
  name: string;
  hp: number;
  max_hp: number;
  atk: number;
  def: number;
  exp: number;
  alive: boolean;
  sprite_atlas: Record<string, string> | null;
  /** Per-(animation × direction) frame URLs. Used by CombatOverlay
   *  to play breathing-idle + attack loops. */
  animation_atlas: Record<string, Record<string, string[]>> | null;
  /** Phase 4c — dedicated side-view combat sprite + animations.
   *  Overlay prefers these when present. */
  combat_sprite_atlas: Record<string, string> | null;
  combat_animation_atlas: Record<string, Record<string, string[]>> | null;
};

export type CombatTurn = { kind: "player" } | { kind: "mob"; idx: number };

export type PlayerActionKind = "attack" | "skill" | "defend" | "dodge";

export type CombatLogEntry =
  | { turn: number; kind: "attack"; actor: "player" | string; target: "player" | string; dmg: number; target_hp_after: number; action_kind?: "attack" | "skill" }
  | { turn: number; kind: "miss"; actor: string; target: "player" | string; reason: "dodged" }
  | { turn: number; kind: "stance"; actor: "player"; mode: "defending" | "dodging" }
  | { turn: number; kind: "death"; actor: string }
  | { turn: number; kind: "victory"; exp_awarded: number; khryn_awarded: number }
  | { turn: number; kind: "defeat" };

export type CombatSession = {
  id: string;
  encounter_id: string;
  player_hp: number;
  player_max_hp: number;
  player_atk: number;
  player_def: number;
  mobs: CombatMobState[];
  turn_order: CombatTurn[];
  turn_idx: number;
  log_entries: CombatLogEntry[];
  is_over: boolean;
  outcome: "victory" | "defeat" | null;
};

export function startEncounter(
  opts: FetchOpts & { characterId: string; encounterId: string; locale: string },
): Promise<{ encounter_id: string; mobs: EncounterMob[]; combat_session: CombatSession; combat_backdrop_url: string | null; room_state: RoomState }> {
  return call(`/api/v1/characters/${opts.characterId}/encounter/start`, "POST", {
    initData: opts.initData,
    body: { encounter_id: opts.encounterId, locale: opts.locale },
    signal: opts.signal,
  });
}

/** POST /combat/action — single-player-attack + auto-resolved mob
 *  counter-attacks until back to the player's turn or combat ends. */
export function sendCombatAction(
  opts: FetchOpts & {
    characterId: string;
    sessionId: string;
    action: PlayerActionKind;
    targetMobIdx?: number;
    locale: string;
  },
): Promise<{ session: CombatSession; appended: CombatLogEntry[]; room_state: RoomState }> {
  return call(`/api/v1/characters/${opts.characterId}/combat/action`, "POST", {
    initData: opts.initData,
    body: {
      session_id: opts.sessionId,
      action: opts.action,
      target_mob_idx: opts.targetMobIdx,
      locale: opts.locale,
    },
    signal: opts.signal,
  });
}

export function interactWithProp(
  opts: FetchOpts & {
    characterId: string;
    propKind: string;
    tileX: number;
    tileY: number;
    locale: string;
  },
): Promise<{ room_state: RoomState; reward: InteractReward }> {
  return call(`/api/v1/characters/${opts.characterId}/interact`, "POST", {
    initData: opts.initData,
    body: {
      prop_kind: opts.propKind,
      tile_x: opts.tileX,
      tile_y: opts.tileY,
      locale: opts.locale,
    },
    signal: opts.signal,
  });
}

/** DEV ONLY — wipes tutorial state so the sequence can be retested on
 *  every app open. Will be removed once the tutorial flow is locked. */
export function devResetTutorial(
  opts: FetchOpts & { characterId: string },
): Promise<{ ok: boolean }> {
  return call(`/api/v1/characters/${opts.characterId}/dev-reset-tutorial`, "POST", {
    initData: opts.initData,
    signal: opts.signal,
  });
}
