import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recomputeAndPersistCombatStats } from "@/lib/server/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/characters/:id/dev-reset-tutorial
 *
 * DEV ONLY — Phase 4d combat polish loop. Drops the player straight
 * into r02 (the river bridge room) with the tutorial marked complete
 * and the starter sword equipped, so we can iterate on the combat
 * scene without having to re-do the whole tutorial flow on every
 * Telegram-app open.
 *
 * Wipes for the calling character:
 *   - tutorial_step = 'complete'
 *   - current_room_id = r02 id (floor 100, room_index 2)
 *   - current_room_entry_dir = null so the room-state builder uses
 *     the tilemap's natural spawn (6, 9) — one tile south of the
 *     encounter trigger, so a single step north fires combat
 *   - hp_current = hp_max so a previous defeat doesn't carry over
 *   - opened_props = '{}' so chests can be re-opened
 *   - seen_encounters = '{}' so the bridge ambush re-fires
 *   - DELETE all combat_sessions rows so the partial-unique-active
 *     index doesn't block a fresh /encounter/start
 *
 * Also ensures a main_hand sword is equipped:
 *   - if main_hand already occupied, leave it
 *   - else if a starter_iron_sword exists in inventory, promote it
 *   - else insert a fresh starter_iron_sword directly into main_hand
 * Finally re-computes characters.atk / def so the player's stats
 * reflect the sword bonus.
 *
 * Preserves: everything else (inventory, currency, attrs, …).
 */

const R02_FLOOR = 100;
const R02_ROOM_INDEX = 2;
const STARTER_SWORD = "starter_iron_sword";
const MAIN_HAND = "main_hand";

/** Extra weapons + shield seeded into the warrior's inventory at
 *  dev-reset so the user can swap main_hand/off_hand from the
 *  inventory UI and watch the combat animations change per family.
 *  Sword + shield are equipped by default (testing combo of choice). */
const TEST_WEAPONS: string[] = [
  "starter_iron_axe",
  "starter_iron_greataxe",
  "starter_iron_greatsword",
];
const TEST_OFF_HAND = "starter_iron_shield";
const OFF_HAND = "off_hand";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await resolveSession(_req);
  if (!session.ok) return session.response;

  const supabase = getSupabaseAdmin();

  const { data: character, error: charErr } = await supabase
    .from("characters")
    .select("id, user_id, hp_max")
    .eq("id", params.id)
    .eq("is_active", true)
    .maybeSingle();
  if (charErr) return NextResponse.json({ error: "DB_FAILED", detail: charErr.message }, { status: 500 });
  if (!character || character.user_id !== session.user.id) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // 1) Resolve r02 id (shared / character_id NULL).
  const { data: r02, error: rErr } = await supabase
    .from("rooms")
    .select("id")
    .eq("floor_number", R02_FLOOR)
    .eq("room_index", R02_ROOM_INDEX)
    .is("character_id", null)
    .maybeSingle();
  if (rErr) return NextResponse.json({ error: "DB_FAILED", detail: rErr.message }, { status: 500 });
  if (!r02) return NextResponse.json({ error: "R02_NOT_SEEDED" }, { status: 500 });

  // 2) Reset character flags + position + vitals.
  const updates = [
    supabase
      .from("characters")
      .update({
        tutorial_step: "complete",
        current_room_id: r02.id as string,
        current_room_entry_dir: null,
        hp_current: (character.hp_max as number | null) ?? 0,
        opened_props: [],
        seen_encounters: [],
      })
      .eq("id", character.id),
    supabase
      .from("combat_sessions")
      .delete()
      .eq("character_id", character.id),
  ];
  const results = await Promise.all(updates);
  for (const r of results) {
    if (r.error) {
      return NextResponse.json({ error: "DB_FAILED", detail: r.error.message }, { status: 500 });
    }
  }

  // 3) Ensure a main_hand item is equipped — without it the combat
  //    scene reads as "unarmed warrior swinging air".
  const { data: existingMainHand, error: mhErr } = await supabase
    .from("character_items")
    .select("id")
    .eq("character_id", character.id)
    .eq("equipped_slot", MAIN_HAND)
    .limit(1)
    .maybeSingle();
  if (mhErr) return NextResponse.json({ error: "DB_FAILED", detail: mhErr.message }, { status: 500 });
  if (!existingMainHand) {
    // Look for a starter sword sitting in inventory we can promote.
    const { data: invSword, error: invErr } = await supabase
      .from("character_items")
      .select("id")
      .eq("character_id", character.id)
      .eq("item_id", STARTER_SWORD)
      .not("inventory_slot", "is", null)
      .limit(1)
      .maybeSingle();
    if (invErr) return NextResponse.json({ error: "DB_FAILED", detail: invErr.message }, { status: 500 });
    if (invSword) {
      const { error: promoteErr } = await supabase
        .from("character_items")
        .update({ inventory_slot: null, equipped_slot: MAIN_HAND })
        .eq("id", invSword.id);
      if (promoteErr) return NextResponse.json({ error: "DB_FAILED", detail: promoteErr.message }, { status: 500 });
    } else {
      const { error: insErr } = await supabase
        .from("character_items")
        .insert({
          character_id: character.id,
          item_id: STARTER_SWORD,
          equipped_slot: MAIN_HAND,
          quantity: 1,
        });
      if (insErr) return NextResponse.json({ error: "DB_FAILED", detail: insErr.message }, { status: 500 });
    }
  }

  // 3b) Seed the alternate weapons + shield into inventory so the
  //     user can test the weapon-family animation system. If they
  //     already exist (any slot), skip. New ones go into the next
  //     free inventory slot.
  const wantedItems = [...TEST_WEAPONS, TEST_OFF_HAND];
  const { data: existing, error: exErr } = await supabase
    .from("character_items")
    .select("id, item_id, inventory_slot, equipped_slot")
    .eq("character_id", character.id)
    .in("item_id", wantedItems);
  if (exErr) return NextResponse.json({ error: "DB_FAILED", detail: exErr.message }, { status: 500 });
  const haveIds = new Set<string>((existing ?? []).map((r) => r.item_id as string));
  const missing = wantedItems.filter((id) => !haveIds.has(id));
  if (missing.length > 0) {
    // Find used inventory slots.
    const { data: invRows, error: invListErr } = await supabase
      .from("character_items")
      .select("inventory_slot")
      .eq("character_id", character.id)
      .not("inventory_slot", "is", null);
    if (invListErr) return NextResponse.json({ error: "DB_FAILED", detail: invListErr.message }, { status: 500 });
    const used = new Set<number>((invRows ?? []).map((r) => r.inventory_slot as number));
    const free: number[] = [];
    for (let i = 0; i < 40 && free.length < missing.length; i++) if (!used.has(i)) free.push(i);
    const inserts = missing.map((itemId, i) => ({
      character_id: character.id,
      item_id: itemId,
      inventory_slot: free[i] ?? null,
      equipped_slot: null,
      quantity: 1,
    }));
    if (inserts.length > 0) {
      const { error: insErr } = await supabase.from("character_items").insert(inserts);
      if (insErr) return NextResponse.json({ error: "DB_FAILED", detail: insErr.message }, { status: 500 });
    }
  }

  // 4) Recompute atk / def to reflect the (now guaranteed) sword.
  try {
    await recomputeAndPersistCombatStats(supabase, character.id);
  } catch (e) {
    return NextResponse.json(
      { error: "RECOMPUTE_FAILED", detail: (e as Error).message },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: { ok: true } });
}
