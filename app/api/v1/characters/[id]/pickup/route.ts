import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildRoomStateForCharacter, roomStateErrorResponse } from "@/lib/server/room-state";
import { onItemPickedUp } from "@/lib/server/tutorial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/characters/:id/pickup  body: { ground_item_id, locale? }
 *
 * Picks up a loose item from the floor and places it in the first
 * empty inventory slot. Anti-cheat: the ground item must be in the
 * character's current room AND visible to them (no swiping someone
 * else's loot via the API). Adjacency is enforced client-side for
 * the Z prompt UX; the server is lenient (player can pick up while
 * standing on the tile too).
 *
 * Returns the new RoomState so the client refreshes inventory + the
 * floor (the picked-up item disappears from ground_items).
 */

type Body = { ground_item_id?: unknown; locale?: unknown };

const TOTAL_INVENTORY_SLOTS = 40; // 5x8 grid, matches the CHECK constraint

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await resolveSession(req);
  if (!session.ok) return session.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (typeof body.ground_item_id !== "string") {
    return NextResponse.json({ error: "MISSING_GROUND_ITEM_ID" }, { status: 400 });
  }
  const groundItemId = body.ground_item_id;

  const supabase = getSupabaseAdmin();

  // Authorise: char belongs to session user.
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

  // Find the ground item and verify visibility + room match.
  const { data: ground, error: gErr } = await supabase
    .from("room_ground_items")
    .select("id, room_id, item_id, quantity, visible_to_character_id, metadata")
    .eq("id", groundItemId)
    .maybeSingle();
  if (gErr) return NextResponse.json({ error: "DB_FAILED", detail: gErr.message }, { status: 500 });
  if (!ground) {
    // Idempotent / race-safe: the ground item is gone (already picked
    // up by an earlier in-flight request, removed by another action,
    // or stale state lingering from a previous session before
    // dev-reset). Don't surface a scary error toast — just return a
    // fresh RoomState so the client clears the stale adjacency and
    // moves on. The user has done nothing wrong; nothing to retry.
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
    return NextResponse.json({ data: { room_state: roomState.data } });
  }
  if (ground.room_id !== character.current_room_id) {
    return NextResponse.json({ error: "WRONG_ROOM" }, { status: 403 });
  }
  if (
    ground.visible_to_character_id !== null &&
    ground.visible_to_character_id !== character.id
  ) {
    return NextResponse.json({ error: "NOT_YOUR_ITEM" }, { status: 403 });
  }

  // Stack-or-place: if the player already has an INVENTORY row with
  // the same item_id, increment its quantity. Else find the first
  // empty slot and INSERT. Stacking matches the user's request to
  // see "×N" badges on duplicate items (most notably tutorial-replay
  // swords). Equipped rows never stack — only inventory.
  const { data: existingStack, error: stackErr } = await supabase
    .from("character_items")
    .select("id, quantity")
    .eq("character_id", character.id)
    .eq("item_id", ground.item_id)
    .not("inventory_slot", "is", null)
    .limit(1)
    .maybeSingle();
  if (stackErr) return NextResponse.json({ error: "DB_FAILED", detail: stackErr.message }, { status: 500 });

  if (existingStack) {
    const newQty = (existingStack.quantity as number) + (ground.quantity as number);
    const { error: bumpErr } = await supabase
      .from("character_items")
      .update({ quantity: newQty })
      .eq("id", existingStack.id);
    if (bumpErr) {
      return NextResponse.json({ error: "DB_FAILED", detail: bumpErr.message }, { status: 500 });
    }
  } else {
    // Find the first empty inventory slot. SELECT all occupied slots in
    // one query, then pick the lowest free index — fast enough at 40 slots
    // that we don't bother with a smarter algorithm.
    const { data: occupiedRows, error: invErr } = await supabase
      .from("character_items")
      .select("inventory_slot")
      .eq("character_id", character.id)
      .not("inventory_slot", "is", null);
    if (invErr) return NextResponse.json({ error: "DB_FAILED", detail: invErr.message }, { status: 500 });
    const occupied = new Set((occupiedRows ?? []).map((r) => r.inventory_slot as number));
    let firstFree = -1;
    for (let i = 0; i < TOTAL_INVENTORY_SLOTS; i++) {
      if (!occupied.has(i)) {
        firstFree = i;
        break;
      }
    }
    if (firstFree === -1) {
      return NextResponse.json({ error: "INVENTORY_FULL" }, { status: 409 });
    }
    const { error: addErr } = await supabase.from("character_items").insert({
      character_id: character.id,
      item_id: ground.item_id,
      inventory_slot: firstFree,
      quantity: ground.quantity,
      metadata: ground.metadata,
    });
    if (addErr) {
      return NextResponse.json({ error: "DB_FAILED", detail: addErr.message }, { status: 500 });
    }
  }
  const { error: rmErr } = await supabase
    .from("room_ground_items")
    .delete()
    .eq("id", groundItemId);
  if (rmErr) {
    // Best-effort: log but don't fail the request (item is in inventory already).
    console.warn(`[pickup] failed to remove ground item ${groundItemId}: ${rmErr.message}`);
  }

  // Tutorial advance.
  try {
    await onItemPickedUp(supabase, {
      characterId: character.id,
      itemId: ground.item_id as string,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "TUTORIAL_ADVANCE_FAILED", detail: (err as Error).message },
      { status: 500 },
    );
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
  return NextResponse.json({ data: { room_state: roomState.data } });
}
