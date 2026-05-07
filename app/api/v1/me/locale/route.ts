import { NextResponse } from "next/server";

import { resolveSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_LOCALES = new Set(["en", "es", "pt", "ru", "zh", "ja", "fr", "de", "hi", "tl"]);

type Body = { locale?: unknown };

export async function PATCH(req: Request) {
  const session = await resolveSession(req);
  if (!session.ok) return session.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (typeof body.locale !== "string" || !ALLOWED_LOCALES.has(body.locale)) {
    return NextResponse.json({ error: "INVALID_LOCALE" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("users")
    .update({ preferred_locale: body.locale })
    .eq("id", session.user.id);
  if (error) {
    return NextResponse.json({ error: "UPDATE_FAILED", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { locale: body.locale } });
}
