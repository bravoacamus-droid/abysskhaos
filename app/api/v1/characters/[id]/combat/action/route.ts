import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildRoomStateForCharacter, roomStateErrorResponse } from "@/lib/server/room-state";
import {
  applyPlayerAttack,
  finalizeCombat,
  type CombatSessionState,
} from "@/lib/server/combat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/characters/:id/combat/action
 *   body: { session_id, action: 'attack', target_mob_idx, locale? }
 *
 * Resolves one player action + ALL mob counter-attacks atomically.
 * Returns the new session state + (if over) the post-combat
 * RoomState (already mutated by finalizeCombat — victory keeps the
 * player in their current room, defeat respawns at r01 full HP).
 *
 * Security:
 *   - Damage / HP / turn order / log resolved server-side using
 *     the persisted session row. Client never sends HP or dmg.
 *   - Session ownership: combat_sessions.character_id must match
 *     the session-resolved character; the URL :id must match too.
 *   - Single in-flight check via combat_sessions row state machine
 *     (is_over partial unique index also prevents double-spawn).
 */

type Body = {
  session_id?: unknown;
  action?: unknown;
  target_mob_idx?: unknown;
  locale?: unknown;
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await resolveSession(req);
  if (!session.ok) return session.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (typeof body.session_id !== "string") {
    return NextResponse.json({ error: "MISSING_SESSION_ID" }, { status: 400 });
  }
  if (body.action !== "attack") {
    return NextResponse.json({ error: "UNSUPPORTED_ACTION" }, { status: 400 });
  }
  if (typeof body.target_mob_idx !== "number") {
    return NextResponse.json({ error: "MISSING_TARGET" }, { status: 400 });
  }

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

  const { data: row, error: selErr } = await supabase
    .from("combat_sessions")
    .select("*")
    .eq("id", body.session_id)
    .eq("character_id", character.id)
    .maybeSingle();
  if (selErr) return NextResponse.json({ error: "DB_FAILED", detail: selErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });

  const current: CombatSessionState = {
    id: row.id as string,
    encounter_id: row.encounter_id as string,
    player_hp: row.player_hp as number,
    player_max_hp: row.player_max_hp as number,
    player_atk: row.player_atk as number,
    player_def: row.player_def as number,
    mobs: row.mobs as CombatSessionState["mobs"],
    turn_order: row.turn_order as CombatSessionState["turn_order"],
    turn_idx: row.turn_idx as number,
    log_entries: row.log_entries as CombatSessionState["log_entries"],
    is_over: row.is_over as boolean,
    outcome: row.outcome as CombatSessionState["outcome"],
  };

  let next: CombatSessionState;
  let appended: CombatSessionState["log_entries"];
  try {
    const result = applyPlayerAttack(current, { targetMobIdx: body.target_mob_idx });
    next = result.next;
    appended = result.appended;
  } catch (e) {
    const code = (e as Error).message;
    const status = code === "NOT_PLAYER_TURN" || code === "INVALID_TARGET" || code === "COMBAT_OVER" ? 409 : 400;
    return NextResponse.json({ error: code }, { status });
  }

  // Persist the new session state.
  const { error: upErr } = await supabase
    .from("combat_sessions")
    .update({
      player_hp: next.player_hp,
      mobs: next.mobs,
      turn_idx: next.turn_idx,
      log_entries: next.log_entries,
      is_over: next.is_over,
      outcome: next.outcome,
      updated_at: new Date().toISOString(),
    })
    .eq("id", next.id);
  if (upErr) return NextResponse.json({ error: "DB_FAILED", detail: upErr.message }, { status: 500 });

  // If combat just ended, apply rewards / respawn to the character.
  if (next.is_over) {
    try {
      await finalizeCombat(supabase, { characterId: character.id, session: next });
    } catch (e) {
      return NextResponse.json(
        { error: "FINALIZE_FAILED", detail: (e as Error).message },
        { status: 500 },
      );
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
      session: next,
      appended,
      room_state: roomState.data,
    },
  });
}
