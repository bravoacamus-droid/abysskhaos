import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only catalog inspector. Lets the operator verify seeded data without
 * exposing it to anyone else. Auth: header `X-Admin-Key` must match
 * ADMIN_API_KEY env var. The endpoint returns at most 100 rows per request.
 *
 * Whitelist of allowed resources keeps this route from acting as a generic
 * tunnel into Postgres.
 */

const ALLOWED_RESOURCES = new Set([
  "elements",
  "status_effects",
  "rarity_tiers",
  "soul_forge_ranks",
  "damage_types",
  "currencies",
  "supported_locales",
  "attributes",
  "sub_attributes",
  "classes",
  "paths",
  "hybrid_classes",
  "sub_branches",
  "titles",
  "biomes",
  "floors",
  "cities",
  "npcs",
  "monster_families",
  "monster_tiers",
  "monsters",
  "items_master",
  "weapons",
  "armor",
  "accessories",
  "consumables",
  "gems",
  "equipment_sets",
  "set_pieces",
  "set_bonuses",
  "loot_tables",
  "monster_drops",
  "translations",
]);

const PRIMARY_KEY_BY_RESOURCE: Record<string, string> = {
  floors: "floor_number",
  weapons: "item_id",
  armor: "item_id",
  accessories: "item_id",
  consumables: "item_id",
  gems: "item_id",
  set_pieces: "set_id",
  set_bonuses: "set_id",
  monster_drops: "monster_id",
  translations: "entity_type",
};

export async function GET(
  request: Request,
  { params }: { params: { resource: string } },
) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    return NextResponse.json({ error: "ADMIN_API_KEY_NOT_CONFIGURED" }, { status: 500 });
  }
  const provided = request.headers.get("x-admin-key");
  if (provided !== adminKey) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const resource = params.resource;
  if (!ALLOWED_RESOURCES.has(resource)) {
    return NextResponse.json({ error: "RESOURCE_NOT_ALLOWED" }, { status: 404 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
  const orderBy = PRIMARY_KEY_BY_RESOURCE[resource] ?? "id";

  const supabase = getSupabaseAdmin();
  const { data, error, count } = await supabase
    .from(resource)
    .select("*", { count: "exact" })
    .order(orderBy, { ascending: true })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: "QUERY_FAILED", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({
    resource,
    total: count ?? null,
    returned: data?.length ?? 0,
    data,
  });
}
