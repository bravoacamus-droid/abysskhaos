import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/characters/:id/dev-reset-tutorial
 *
 * DEV ONLY — resets only the tutorial GATING state so the flow can
 * replay on every app open. EVERYTHING the player has acquired is
 * preserved: inventory, equipped gear, ground items, currency. Each
 * tutorial replay drops a NEW starter sword, which stacks with any
 * the player already owns (Phase-3d pickup logic increments quantity
 * on same item_id). This is what the user explicitly asked for —
 * accumulate swords across replays to see their stats.
 *
 * Wipes for the calling character:
 *   - tutorial_step = 'walk_to_cedric'
 *   - opened_props = '{}' so chests / hatches / levers can be
 *     re-tested. Persistence is a real feature for live players;
 *     dev-reset is the explicit escape hatch for QA.
 *   - seen_encounters = '{}' so scripted ambushes (bridge centaur +
 *     archer) can re-fire on the next walk-through; otherwise after
 *     defeat-respawn the combat couldn't replay because the trigger
 *     was already marked seen.
 *   - delete every row from combat_sessions for this character —
 *     stale 'over' rows + any abandoned in-flight session both go,
 *     so a fresh /encounter/start can build a new one without
 *     hitting the partial-unique-active-session index.
 *   - delete the cedric_the_broken row from character_npc_meets so
 *     the first-dialogue gate re-fires.
 *
 * Preserves: character_items (inventory + equipped) and any
 * room_ground_items still on the floor — so a half-finished previous
 * run's leftover sword can still be picked up. The
 * onDialogueCompleted idempotency check guards against duplicate
 * ground drops if the dialogue re-fires before pickup.
 */

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

  const [r1, r2, r3] = await Promise.all([
    supabase
      .from("characters")
      .update({ tutorial_step: "walk_to_cedric", opened_props: [], seen_encounters: [] })
      .eq("id", character.id),
    supabase
      .from("character_npc_meets")
      .delete()
      .eq("character_id", character.id)
      .eq("npc_id", "cedric_the_broken"),
    supabase
      .from("combat_sessions")
      .delete()
      .eq("character_id", character.id),
  ]);
  for (const r of [r1, r2, r3]) {
    if (r.error) {
      return NextResponse.json({ error: "DB_FAILED", detail: r.error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ data: { ok: true } });
}
