import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public read of the 5 base classes (with portraits) so the character
 * creation wizard can render the class cards. Translations for the requested
 * locale are inlined as `name_localized` / `description_localized` to save
 * the client a second round-trip.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const locale = url.searchParams.get("locale") ?? "en";

  const supabase = getSupabaseAdmin();
  const { data: classes, error } = await supabase
    .from("classes")
    .select(
      "id, name, description, primary_attr_a_id, primary_attr_b_id, starting_hp, starting_mp, starting_atk, starting_def, sort_order, portrait_url",
    )
    .order("sort_order", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "DB_QUERY_FAILED", detail: error.message }, { status: 500 });
  }

  const classIds = (classes ?? []).map((c) => c.id);
  let translations: Map<string, Record<string, string>> = new Map();
  if (locale !== "en" && classIds.length > 0) {
    const { data: trans, error: tErr } = await supabase
      .from("translations")
      .select("entity_id, field, value")
      .eq("entity_type", "class")
      .eq("locale", locale)
      .in("entity_id", classIds);
    if (tErr) {
      return NextResponse.json({ error: "TRANSLATIONS_QUERY_FAILED", detail: tErr.message }, { status: 500 });
    }
    translations = new Map();
    for (const row of trans ?? []) {
      const entry = translations.get(row.entity_id) ?? {};
      entry[row.field as string] = row.value as string;
      translations.set(row.entity_id, entry);
    }
  }

  const data = (classes ?? []).map((c) => {
    const tr = translations.get(c.id) ?? {};
    return {
      ...c,
      name_localized: tr.name ?? c.name,
      description_localized: tr.description ?? c.description,
    };
  });

  return NextResponse.json({ data });
}
