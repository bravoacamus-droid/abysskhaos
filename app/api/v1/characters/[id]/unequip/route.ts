import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildRoomStateForCharacter, roomStateErrorResponse } from "@/lib/server/room-state";
import { recomputeAndPersistCombatStats } from "@/lib/server/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/characters/:id/unequip  body: { character_item_id, locale? }
 *
 * Moves an equipped item back into the first empty inventory slot.
 * Errors with INVENTORY_FULL if there's no room — caller must drop
 * something first.
 */

type Body = { character_item_id?: unknown; locale?: unknown };
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
  if (typeof body.character_item_id !== "string") {
    return NextResponse.json({ error: "MISSING_ITEM_ID" }, { status: 400 });
  }
  const characterItemId = body.character_item_id;

  const supabase = getSupabaseAdmin();
  const { data: character, error: charErr } = await supabase
    .from("characters")
    .select("id, user_id")
    .eq("id", params.id)
    .eq("is_active", true)
    .maybeSingle();
  if (charErr) return NextResponse.json({ error: "DB_FAILED", detail: charErr.message }, { status: 500 });
  if (!character || character.user_id !== session.user.id) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const { data: charItem, error: ciErr } = await supabase
    .from("character_items")
    .select("id, character_id, equipped_slot")
    .eq("id", characterItemId)
    .maybeSingle();
  if (ciErr) return NextResponse.json({ error: "DB_FAILED", detail: ciErr.message }, { status: 500 });
  if (!charItem || charItem.character_id !== character.id) {
    return NextResponse.json({ error: "ITEM_NOT_OWNED" }, { status: 404 });
  }
  if (!charItem.equipped_slot) {
    return NextResponse.json({ error: "ITEM_NOT_EQUIPPED" }, { status: 409 });
  }

  const { data: occupiedRows } = await supabase
    .from("character_items")
    .select("inventory_slot")
    .eq("character_id", character.id)
    .not("inventory_slot", "is", null);
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

  const { error: upErr } = await supabase
    .from("character_items")
    .update({ inventory_slot: firstFree, equipped_slot: null })
    .eq("id", charItem.id);
  if (upErr) return NextResponse.json({ error: "DB_FAILED", detail: upErr.message }, { status: 500 });

  // Server-authoritative recompute after the equipped set changes.
  try {
    await recomputeAndPersistCombatStats(supabase, character.id);
  } catch (err) {
    return NextResponse.json(
      { error: "RECOMPUTE_FAILED", detail: (err as Error).message },
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
