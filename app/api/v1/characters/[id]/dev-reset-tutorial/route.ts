import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/characters/:id/dev-reset-tutorial
 *
 * DEV ONLY — resets the tutorial flow end-to-end so it can replay
 * cleanly on every app open. Scope is narrow: only the tutorial
 * sword (`starter_iron_sword`) is wiped, so the player can pick it up
 * fresh after re-doing the Cedric dialogue. Any OTHER inventory the
 * character has accumulated (loot from later play, gear from manual
 * grants) is preserved.
 *
 * Wipes for the calling character:
 *   - tutorial_step = 'walk_to_cedric'
 *   - delete the cedric_the_broken row from character_npc_meets so
 *     the first-dialogue gate re-fires
 *   - delete the tutorial sword from character_items (inventory or
 *     equipped) so the drop happens again
 *   - delete any room_ground_items still scoped to this character
 *     (so a half-finished previous run doesn't leave a leftover
 *     sword on the floor)
 *   - recompute combat stats since the tutorial sword may have been
 *     equipped (recomputeAndPersistCombatStats handles the now-empty
 *     equipped set).
 */

import { recomputeAndPersistCombatStats } from "@/lib/server/stats";

const TUTORIAL_SWORD_ITEM_ID = "starter_iron_sword";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await resolveSession(_req);
  if (!session.ok) return session.response;

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

  const [r1, r2, r3, r4] = await Promise.all([
    supabase
      .from("characters")
      .update({ tutorial_step: "walk_to_cedric" })
      .eq("id", character.id),
    supabase
      .from("character_npc_meets")
      .delete()
      .eq("character_id", character.id)
      .eq("npc_id", "cedric_the_broken"),
    supabase
      .from("character_items")
      .delete()
      .eq("character_id", character.id)
      .eq("item_id", TUTORIAL_SWORD_ITEM_ID),
    supabase
      .from("room_ground_items")
      .delete()
      .eq("visible_to_character_id", character.id)
      .eq("item_id", TUTORIAL_SWORD_ITEM_ID),
  ]);
  for (const r of [r1, r2, r3, r4]) {
    if (r.error) {
      return NextResponse.json({ error: "DB_FAILED", detail: r.error.message }, { status: 500 });
    }
  }

  // The sword we just deleted may have been equipped — recompute so
  // characters.atk/def doesn't drift above the now-bare equipment set.
  try {
    await recomputeAndPersistCombatStats(supabase, character.id);
  } catch (e) {
    return NextResponse.json(
      { error: "DB_FAILED", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: { ok: true } });
}
