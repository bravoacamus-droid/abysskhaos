import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/characters/:id/move  body: { direction: 'north'|'south'|'east'|'west' }
 *
 * Server-authoritative movement: the client never picks the destination
 * room id, only a direction. The server checks the connection, refuses
 * locked edges, and writes `current_room_id`.
 */

const DIRECTIONS = new Set(["north", "south", "east", "west"]);

type Body = { direction?: unknown };

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await resolveSession(req);
  if (!session.ok) return session.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (typeof body.direction !== "string" || !DIRECTIONS.has(body.direction)) {
    return NextResponse.json({ error: "INVALID_DIRECTION" }, { status: 400 });
  }

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
    return NextResponse.json({ error: "NO_CURRENT_ROOM" }, { status: 400 });
  }

  const { data: conn, error: connErr } = await supabase
    .from("room_connections")
    .select("to_room_id, is_locked, unlock_requirement")
    .eq("from_room_id", character.current_room_id)
    .eq("direction", body.direction)
    .maybeSingle();
  if (connErr) return NextResponse.json({ error: "DB_FAILED", detail: connErr.message }, { status: 500 });
  if (!conn) {
    return NextResponse.json({ error: "NO_EXIT" }, { status: 409 });
  }
  if (conn.is_locked) {
    return NextResponse.json(
      { error: "LOCKED", detail: conn.unlock_requirement ?? "locked" },
      { status: 409 },
    );
  }

  // Get target room's floor so we can sync `current_floor` if it changed.
  const { data: target, error: tErr } = await supabase
    .from("rooms")
    .select("floor_number")
    .eq("id", conn.to_room_id)
    .single();
  if (tErr) return NextResponse.json({ error: "DB_FAILED", detail: tErr.message }, { status: 500 });

  const { error: upErr } = await supabase
    .from("characters")
    .update({
      current_room_id: conn.to_room_id,
      current_floor: target.floor_number,
    })
    .eq("id", character.id);
  if (upErr) return NextResponse.json({ error: "DB_FAILED", detail: upErr.message }, { status: 500 });

  return NextResponse.json({
    data: {
      current_room_id: conn.to_room_id,
      current_floor: target.floor_number,
    },
  });
}
