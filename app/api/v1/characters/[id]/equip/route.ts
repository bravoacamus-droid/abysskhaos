import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildRoomStateForCharacter, roomStateErrorResponse } from "@/lib/server/room-state";
import { onItemEquipped } from "@/lib/server/tutorial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/characters/:id/equip
 *   body: { character_item_id, slot, locale? }
 *
 * Equips an inventory item into a slot. If the slot is already
 * occupied, the previous occupant is bounced back into the first
 * empty inventory slot (so equipping is a swap, never a destructive
 * action). Server validates that the slot is compatible with the
 * item's type (e.g. armor_chest only accepts chest-slot armor).
 *
 * Returns the new RoomState so the React inventory panel refreshes
 * its layout in one round-trip.
 */

const VALID_SLOTS = new Set([
  "main_hand",
  "off_hand",
  "armor_head",
  "armor_chest",
  "armor_arms",
  "armor_legs",
  "armor_feet",
  "accessory_ring_1",
  "accessory_ring_2",
  "accessory_amulet",
]);

const TOTAL_INVENTORY_SLOTS = 40;

type Body = { character_item_id?: unknown; slot?: unknown; locale?: unknown };

/** Maps an items_master row to the slots it's allowed to be equipped in. */
function allowedSlotsForItem(
  itemType: string,
  weapon: { handedness?: string } | null,
  armor: { slot?: string } | null,
  accessory: { slot?: string } | null,
): Set<string> {
  if (itemType === "weapon" && weapon) {
    // Phase 1: warriors can dual-wield 1H weapons. 2H weapons take both
    // slots (we'll enforce that in a later equip migration; for now any
    // 1H weapon goes in either main or off hand).
    if (weapon.handedness === "two_handed") return new Set(["main_hand"]);
    if (weapon.handedness === "off_hand") return new Set(["off_hand"]);
    return new Set(["main_hand", "off_hand"]);
  }
  if (itemType === "armor" && armor?.slot) {
    const map: Record<string, string> = {
      head: "armor_head",
      chest: "armor_chest",
      arms: "armor_arms",
      legs: "armor_legs",
      feet: "armor_feet",
      off_hand_shield: "off_hand",
    };
    const target = map[armor.slot];
    return target ? new Set([target]) : new Set();
  }
  if (itemType === "accessory" && accessory?.slot) {
    if (accessory.slot === "ring") return new Set(["accessory_ring_1", "accessory_ring_2"]);
    if (accessory.slot === "amulet") return new Set(["accessory_amulet"]);
  }
  return new Set();
}

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
  if (typeof body.slot !== "string" || !VALID_SLOTS.has(body.slot)) {
    return NextResponse.json({ error: "INVALID_SLOT" }, { status: 400 });
  }
  const characterItemId = body.character_item_id;
  const targetSlot = body.slot;

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

  // Load the item being equipped + its catalog row + the sub-table that
  // matches its type (weapon/armor/accessory). The sub-tables let us
  // validate slot compatibility.
  const { data: charItem, error: ciErr } = await supabase
    .from("character_items")
    .select("id, character_id, item_id, inventory_slot, equipped_slot")
    .eq("id", characterItemId)
    .maybeSingle();
  if (ciErr) return NextResponse.json({ error: "DB_FAILED", detail: ciErr.message }, { status: 500 });
  if (!charItem || charItem.character_id !== character.id) {
    return NextResponse.json({ error: "ITEM_NOT_OWNED" }, { status: 404 });
  }

  const { data: itemRow, error: itErr } = await supabase
    .from("items_master")
    .select("id, item_type")
    .eq("id", charItem.item_id)
    .single();
  if (itErr) return NextResponse.json({ error: "DB_FAILED", detail: itErr.message }, { status: 500 });

  const [{ data: w }, { data: a }, { data: ac }] = await Promise.all([
    supabase.from("weapons").select("handedness").eq("item_id", itemRow.id).maybeSingle(),
    supabase.from("armor").select("slot").eq("item_id", itemRow.id).maybeSingle(),
    supabase.from("accessories").select("slot").eq("item_id", itemRow.id).maybeSingle(),
  ]);

  const allowed = allowedSlotsForItem(itemRow.item_type as string, w, a, ac);
  if (!allowed.has(targetSlot)) {
    return NextResponse.json(
      { error: "SLOT_MISMATCH", detail: `${itemRow.item_type} cannot equip to ${targetSlot}` },
      { status: 409 },
    );
  }

  // If the target slot is already occupied, bounce the occupant into
  // the first free inventory slot. Read state, find free slot, then
  // do the two updates in sequence (no SQL transaction yet; the worst
  // case is the user briefly owning two items in flight).
  const { data: existing } = await supabase
    .from("character_items")
    .select("id")
    .eq("character_id", character.id)
    .eq("equipped_slot", targetSlot)
    .maybeSingle();
  if (existing && existing.id !== charItem.id) {
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
      return NextResponse.json({ error: "INVENTORY_FULL_FOR_SWAP" }, { status: 409 });
    }
    const { error: bounceErr } = await supabase
      .from("character_items")
      .update({ inventory_slot: firstFree, equipped_slot: null })
      .eq("id", existing.id);
    if (bounceErr) {
      return NextResponse.json({ error: "DB_FAILED", detail: bounceErr.message }, { status: 500 });
    }
  }

  // Promote the item from inventory (or another equipped slot) to the target slot.
  const { error: upErr } = await supabase
    .from("character_items")
    .update({ inventory_slot: null, equipped_slot: targetSlot })
    .eq("id", charItem.id);
  if (upErr) {
    return NextResponse.json({ error: "DB_FAILED", detail: upErr.message }, { status: 500 });
  }

  // Tutorial advance.
  try {
    await onItemEquipped(supabase, {
      characterId: character.id,
      itemId: charItem.item_id as string,
      slot: targetSlot,
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
