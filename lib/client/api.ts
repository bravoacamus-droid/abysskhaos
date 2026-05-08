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

export type RoomNpc = {
  id: string;
  name: string;
  title: string | null;
  portrait_url: string | null;
  sprite_atlas: SpriteAtlas | null;
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
    sprite_atlas: SpriteAtlas | null;
    portrait_url: string | null;
  };
  connections: RoomConnectionRow[];
  npcs: RoomNpc[];
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
  return call(`/api/v1/characters/${opts.characterId}/room?locale=${encodeURIComponent(opts.locale)}`, "GET", {
    initData: opts.initData,
    signal: opts.signal,
  });
}

export function moveCharacter(
  opts: FetchOpts & { characterId: string; direction: Direction },
): Promise<{ current_room_id: string; current_floor: number }> {
  return call(`/api/v1/characters/${opts.characterId}/move`, "POST", {
    initData: opts.initData,
    body: { direction: opts.direction },
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
): Promise<{ ok: boolean }> {
  return call(`/api/v1/characters/${opts.characterId}/dialogue/${opts.npcId}`, "POST", {
    initData: opts.initData,
    signal: opts.signal,
  });
}
