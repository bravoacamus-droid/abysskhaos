import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { onDialogueCompleted } from "@/lib/server/tutorial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/characters/:id/dialogue/:npcId
 *   query: locale (default 'en')
 *
 * Returns the next dialogue this NPC should deliver. For Phase 3a we always
 * return the `is_default_first` dialogue and translate each line. After the
 * client confirms the dialogue ended, it POSTs to the same URL to mark the
 * NPC as met (so future calls can branch to a "returning" dialogue once
 * those exist).
 */

export async function GET(
  req: Request,
  { params }: { params: { id: string; npcId: string } },
) {
  const session = await resolveSession(req);
  if (!session.ok) return session.response;

  const url = new URL(req.url);
  const locale = url.searchParams.get("locale") ?? "en";

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

  // The NPC must be in the character's current room (anti-cheat: prevent
  // dialogue with NPCs the player isn't standing next to).
  const { data: present, error: presentErr } = await supabase
    .from("room_npcs")
    .select("npc_id")
    .eq("room_id", character.current_room_id)
    .eq("npc_id", params.npcId)
    .maybeSingle();
  if (presentErr) return NextResponse.json({ error: "DB_FAILED", detail: presentErr.message }, { status: 500 });
  if (!present) return NextResponse.json({ error: "NPC_NOT_IN_ROOM" }, { status: 404 });

  // Pick dialogue: default-first for Phase 3a.
  const { data: dialogue, error: dlgErr } = await supabase
    .from("npc_dialogues")
    .select("id, dialogue_key")
    .eq("npc_id", params.npcId)
    .eq("is_default_first", true)
    .maybeSingle();
  if (dlgErr) return NextResponse.json({ error: "DB_FAILED", detail: dlgErr.message }, { status: 500 });
  if (!dialogue) return NextResponse.json({ error: "NO_DIALOGUE" }, { status: 404 });

  const { data: lines, error: linesErr } = await supabase
    .from("npc_dialogue_lines")
    .select("id, sequence_index, speaker, text")
    .eq("dialogue_id", dialogue.id)
    .order("sequence_index", { ascending: true });
  if (linesErr) return NextResponse.json({ error: "DB_FAILED", detail: linesErr.message }, { status: 500 });

  const lineIds = (lines ?? []).map((l) => l.id as string);
  const tMap = new Map<string, string>();
  if (locale !== "en" && lineIds.length > 0) {
    const { data: tr } = await supabase
      .from("translations")
      .select("entity_id, value")
      .eq("entity_type", "npc_dialogue_line")
      .eq("locale", locale)
      .eq("field", "text")
      .in("entity_id", lineIds);
    for (const row of tr ?? []) {
      tMap.set(row.entity_id as string, row.value as string);
    }
  }

  const localizedLines = (lines ?? []).map((l) => ({
    id: l.id as string,
    sequence_index: l.sequence_index as number,
    speaker: l.speaker as "npc" | "narrator" | "choice",
    text: l.text as string,
    text_localized: tMap.get(l.id as string) ?? (l.text as string),
  }));

  return NextResponse.json({
    data: {
      dialogue_key: dialogue.dialogue_key,
      lines: localizedLines,
    },
  });
}

/**
 * POST /api/v1/characters/:id/dialogue/:npcId
 *
 * Marks the NPC as met (idempotent). Call this after the user finishes
 * scrolling through the dialogue lines.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string; npcId: string } },
) {
  const session = await resolveSession(req);
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

  const { error: upErr } = await supabase
    .from("character_npc_meets")
    .upsert(
      { character_id: character.id, npc_id: params.npcId },
      { onConflict: "character_id,npc_id", ignoreDuplicates: true },
    );
  if (upErr) return NextResponse.json({ error: "DB_FAILED", detail: upErr.message }, { status: 500 });

  // Tutorial hook: Cedric's first dialogue ending drops the starter
  // sword and advances the tutorial step. Idempotent — re-calling this
  // endpoint after the player already saw it is a no-op.
  let newTutorialStep: string | null = null;
  try {
    newTutorialStep = await onDialogueCompleted(supabase, {
      characterId: character.id,
      npcId: params.npcId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "TUTORIAL_ADVANCE_FAILED", detail: (err as Error).message },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: { ok: true, tutorial_step: newTutorialStep } });
}
