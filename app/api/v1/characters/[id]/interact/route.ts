import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildRoomStateForCharacter, roomStateErrorResponse } from "@/lib/server/room-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/characters/:id/interact
 *   body: { prop_kind, tile_x, tile_y, locale? }
 *
 * Interact with a static prop sitting at (tile_x, tile_y) in the
 * character's current room. Today this is one-shot loot: a copper
 * chest with `metadata.interact = { kind: 'loot', items: [...] }`
 * grants the listed items every time it's opened (no state stored;
 * the user explicitly asked for it to repeat for now). Future use
 * cases (lockable doors, levers, NPCs) plug into the same endpoint
 * by adding new `interact.kind` branches.
 *
 * Validates everything server-side: room match, prop existence,
 * prop is interactable, and the player is on / adjacent to the tile.
 * The client only POSTs the intent (prop_kind + tile coordinates);
 * the server reads metadata from the props table directly so a
 * tampered client can't, say, hand back a chest_kind=mythic_dragon
 * to skip endgame loot.
 */

type Body = {
  prop_kind?: unknown;
  tile_x?: unknown;
  tile_y?: unknown;
  locale?: unknown;
};

type Tilemap = {
  width: number;
  height: number;
  props?: Array<{ kind: string; x: number; y: number }>;
};

type InteractMeta = {
  kind?: string;
  items?: Array<{ item_id: string; quantity?: number }>;
  /** i18n key for the human-readable reward toast. */
  message_key?: string;
};

const TOTAL_INVENTORY_SLOTS = 40;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await resolveSession(req);
  if (!session.ok) return session.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (typeof body.prop_kind !== "string") {
    return NextResponse.json({ error: "MISSING_PROP_KIND" }, { status: 400 });
  }
  if (typeof body.tile_x !== "number" || typeof body.tile_y !== "number") {
    return NextResponse.json({ error: "MISSING_TILE" }, { status: 400 });
  }
  const propKind = body.prop_kind;
  const tileX = body.tile_x;
  const tileY = body.tile_y;

  const supabase = getSupabaseAdmin();

  const { data: character, error: charErr } = await supabase
    .from("characters")
    .select("id, user_id, current_room_id")
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

  // Verify the prop exists in the room's tilemap at the named tile.
  // Anti-cheat: a client can't claim to interact with a chest that
  // doesn't exist in their current room.
  const { data: room, error: rErr } = await supabase
    .from("rooms")
    .select("tilemap_data")
    .eq("id", character.current_room_id)
    .single();
  if (rErr) return NextResponse.json({ error: "DB_FAILED", detail: rErr.message }, { status: 500 });
  const tilemap = (room.tilemap_data as Tilemap | null) ?? null;
  const matchInTilemap = (tilemap?.props ?? []).find(
    (p) => p.kind === propKind && p.x === tileX && p.y === tileY,
  );
  if (!matchInTilemap) {
    return NextResponse.json({ error: "PROP_NOT_IN_ROOM" }, { status: 404 });
  }

  // Load the prop definition and read its interact metadata.
  const { data: propDef, error: pErr } = await supabase
    .from("props")
    .select("metadata")
    .eq("id", propKind)
    .maybeSingle();
  if (pErr) return NextResponse.json({ error: "DB_FAILED", detail: pErr.message }, { status: 500 });
  if (!propDef) return NextResponse.json({ error: "PROP_UNKNOWN" }, { status: 404 });
  const interactMeta =
    ((propDef.metadata as Record<string, unknown> | null)?.interact as InteractMeta | undefined) ??
    null;
  if (!interactMeta || interactMeta.kind !== "loot") {
    return NextResponse.json({ error: "PROP_NOT_INTERACTABLE" }, { status: 409 });
  }
  const items = interactMeta.items ?? [];
  if (items.length === 0) {
    return NextResponse.json({ error: "PROP_EMPTY" }, { status: 409 });
  }

  // Grant each listed item. For each: stack into the existing
  // inventory row if one exists, else find the first free slot.
  // Mirrors the pickup endpoint's logic so weapons/potions behave the
  // same whether collected from the floor or out of a chest.
  for (const grant of items) {
    const qty = grant.quantity ?? 1;
    const { data: existing, error: exErr } = await supabase
      .from("character_items")
      .select("id, quantity")
      .eq("character_id", character.id)
      .eq("item_id", grant.item_id)
      .not("inventory_slot", "is", null)
      .limit(1)
      .maybeSingle();
    if (exErr) return NextResponse.json({ error: "DB_FAILED", detail: exErr.message }, { status: 500 });

    if (existing) {
      const { error: bumpErr } = await supabase
        .from("character_items")
        .update({ quantity: (existing.quantity as number) + qty })
        .eq("id", existing.id);
      if (bumpErr) return NextResponse.json({ error: "DB_FAILED", detail: bumpErr.message }, { status: 500 });
    } else {
      const { data: occupiedRows } = await supabase
        .from("character_items")
        .select("inventory_slot")
        .eq("character_id", character.id)
        .not("inventory_slot", "is", null);
      const occupied = new Set((occupiedRows ?? []).map((r) => r.inventory_slot as number));
      let firstFree = -1;
      for (let i = 0; i < TOTAL_INVENTORY_SLOTS; i++) {
        if (!occupied.has(i)) { firstFree = i; break; }
      }
      if (firstFree === -1) {
        return NextResponse.json({ error: "INVENTORY_FULL" }, { status: 409 });
      }
      const { error: addErr } = await supabase.from("character_items").insert({
        character_id: character.id,
        item_id: grant.item_id,
        inventory_slot: firstFree,
        quantity: qty,
      });
      if (addErr) return NextResponse.json({ error: "DB_FAILED", detail: addErr.message }, { status: 500 });
    }
  }

  const locale = typeof body.locale === "string" ? body.locale : "en";
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
      room_state: roomState.data,
      reward: {
        message_key: interactMeta.message_key ?? "interact.reward_generic",
        items,
      },
    },
  });
}
