/**
 * Per-request Telegram session resolver.
 *
 * Phase 2 still uses the simplest possible session model: the client passes
 * `initData` in a header on every authenticated request, the server verifies
 * the HMAC, looks up the user, and returns the row. Phase 7 will move to a
 * signed cookie + custom Supabase JWT so the client can hit RLS-protected
 * tables directly. For now, all writes funnel through trusted server routes.
 */

import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { InitDataError, verifyInitData } from "@/lib/telegram/verify-init-data";

export type SessionUser = {
  id: string;
  telegram_id: number;
  first_name: string;
  username: string | null;
  language_code: string | null;
  preferred_locale: string | null;
};

export type SessionResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

const INIT_DATA_HEADER = "x-telegram-init-data";

/**
 * Read `x-telegram-init-data` from the request, verify it, and return the
 * matching `users` row. On failure returns a `NextResponse` ready to send.
 */
export async function resolveSession(req: Request): Promise<SessionResult> {
  const initData = req.headers.get(INIT_DATA_HEADER);
  if (!initData) {
    return {
      ok: false,
      response: NextResponse.json({ error: "MISSING_INIT_DATA" }, { status: 401 }),
    };
  }

  try {
    const verified = await verifyInitData(
      initData,
      serverEnv.TELEGRAM_BOT_TOKEN,
      serverEnv.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
    );
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("users")
      .select("id, telegram_id, first_name, username, language_code, preferred_locale")
      .eq("telegram_id", verified.user.id)
      .maybeSingle();
    if (error) {
      return {
        ok: false,
        response: NextResponse.json({ error: "DB_LOOKUP_FAILED", detail: error.message }, { status: 500 }),
      };
    }
    if (!data) {
      return {
        ok: false,
        response: NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 }),
      };
    }
    return { ok: true, user: data as SessionUser };
  } catch (err) {
    if (err instanceof InitDataError) {
      return {
        ok: false,
        response: NextResponse.json({ error: err.code, detail: err.message }, { status: 401 }),
      };
    }
    return {
      ok: false,
      response: NextResponse.json({ error: "VERIFY_FAILED" }, { status: 500 }),
    };
  }
}

export const TELEGRAM_INIT_DATA_HEADER = INIT_DATA_HEADER;
