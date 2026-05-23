import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildRoomStateForCharacter, roomStateErrorResponse } from "@/lib/server/room-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/characters/:id/room → full RoomState for the Phaser scene
 * (tilemap, biome tileset, NPCs, props, player sprites, exits, locale).
 *
 * The heavy lifting lives in `lib/server/room-state.ts` so POST /move
 * can reuse it and return the next room in the same round-trip.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await resolveSession(req);
  if (!session.ok) return session.response;

  const url = new URL(req.url);
  const locale = url.searchParams.get("locale") ?? "en";

  const supabase = getSupabaseAdmin();
  const result = await buildRoomStateForCharacter(supabase, {
    characterId: params.id,
    userId: session.user.id,
    locale,
  });

  if (!result.ok) {
    const { status, body } = roomStateErrorResponse(result.error);
    return NextResponse.json(body, { status });
  }

  return NextResponse.json(
    { data: result.data },
    {
      // Telegram WebViews and the Cloudflare edge can both decide to
      // cache GET responses heuristically. tilemap_data changes whenever
      // the player moves; any cache hit means stale walls / phantom
      // exits. no-store is the only way to be safe.
      headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
    },
  );
}
