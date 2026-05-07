import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { InitDataError, verifyInitData } from "@/lib/telegram/verify-init-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { initData?: unknown };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.initData !== "string" || body.initData.length === 0) {
    return NextResponse.json({ error: "Missing initData" }, { status: 400 });
  }

  let verified;
  try {
    verified = await verifyInitData(
      body.initData,
      serverEnv.TELEGRAM_BOT_TOKEN,
      serverEnv.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
    );
  } catch (err) {
    if (err instanceof InitDataError) {
      // Diagnostic info is included only when DEBUG_AUTH=1 is set in the
      // environment. Until Phase 0 is fully verified end-to-end, default ON.
      const includeDebug = (process.env.DEBUG_AUTH ?? "1") === "1";
      return NextResponse.json(
        {
          error: err.code,
          detail: err.message,
          ...(includeDebug && err.debug ? { debug: err.debug } : {}),
        },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: "VERIFY_FAILED" }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  const tg = verified.user;

  // Upsert by telegram_id, return (firstName, username, isNew).
  // We do a simple select-then-insert/update so we can report `isNew`.
  const { data: existing, error: selectErr } = await supabase
    .from("users")
    .select("id, first_name, username")
    .eq("telegram_id", tg.id)
    .maybeSingle();

  if (selectErr) {
    return NextResponse.json({ error: "DB_SELECT_FAILED", detail: selectErr.message }, { status: 500 });
  }

  let isNew = false;
  if (existing === null) {
    const { error: insertErr } = await supabase.from("users").insert({
      telegram_id: tg.id,
      first_name: tg.first_name,
      last_name: tg.last_name ?? null,
      username: tg.username ?? null,
      language_code: tg.language_code ?? null,
      is_premium: tg.is_premium ?? false,
      photo_url: tg.photo_url ?? null,
    });
    if (insertErr) {
      return NextResponse.json(
        { error: "DB_INSERT_FAILED", detail: insertErr.message },
        { status: 500 },
      );
    }
    isNew = true;
  } else {
    const { error: updateErr } = await supabase
      .from("users")
      .update({
        first_name: tg.first_name,
        last_name: tg.last_name ?? null,
        username: tg.username ?? null,
        language_code: tg.language_code ?? null,
        is_premium: tg.is_premium ?? false,
        photo_url: tg.photo_url ?? null,
        last_seen_at: new Date().toISOString(),
      })
      .eq("telegram_id", tg.id);
    if (updateErr) {
      return NextResponse.json(
        { error: "DB_UPDATE_FAILED", detail: updateErr.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    user: {
      firstName: tg.first_name,
      username: tg.username ?? null,
      isNew,
    },
  });
}
