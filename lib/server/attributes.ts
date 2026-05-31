/**
 * Server-side attribute breakdown: loads the 4 primary attributes + 20
 * sub-attributes from the catalog (with i18n) and computes each
 * sub-attribute's derived value from the character's primary attr score.
 *
 * Sub-attributes whose `effect_per_point` is null are pure metadata for
 * now — the UI shows their name + description but no number, with a
 * "TBD" placeholder. As the balance pass fills coefficients in
 * `data/seeds/attributes.ts` (and reseeds), the values start appearing
 * with NO client / server changes required.
 *
 * Security note (see feedback_security_server_authoritative): the
 * client receives the *result* of this computation, never the
 * coefficients-times-stat formula it could re-run with cheated inputs.
 * The server reads the character's primary attrs from the DB row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type AttributeCatalogRow = {
  id: string;
  abbrev: string;
  name: string;
  description: string | null;
  sort_order: number;
};

export type SubAttributeCatalogRow = {
  id: string;
  parent_attribute_id: string;
  name: string;
  description: string | null;
  effect_per_point: number | null;
  effect_unit: string | null;
  sort_order: number;
};

export type AttributeBreakdownGroup = {
  id: string;
  abbrev: string;
  name_localized: string;
  description_localized: string | null;
  value: number;
  sub_attributes: Array<{
    id: string;
    name_localized: string;
    description_localized: string | null;
    effect_per_point: number | null;
    effect_unit: string | null;
    derived_value: number | null;
  }>;
};

type CharacterPrimaryAttrs = {
  attr_strength: number;
  attr_agility: number;
  attr_intelligence: number;
  attr_spirit: number;
};

const PARENT_TO_FIELD: Record<string, keyof CharacterPrimaryAttrs> = {
  strength: "attr_strength",
  agility: "attr_agility",
  intelligence: "attr_intelligence",
  spirit: "attr_spirit",
};

/**
 * Loads the 4 attributes + 20 sub-attributes from the catalog, applies
 * locale overrides, derives each sub-attribute's value from the
 * character's primary attr, returns one grouped row per primary.
 *
 * Sub-attrs come back sorted by sort_order so the order matches what
 * `data/seeds/attributes.ts` declares (top-to-bottom of the seed list).
 */
export async function buildAttributeBreakdown(
  supabase: SupabaseClient,
  character: CharacterPrimaryAttrs,
  locale: string,
): Promise<AttributeBreakdownGroup[]> {
  const [attrsRes, subsRes] = await Promise.all([
    supabase
      .from("attributes")
      .select("id, abbrev, name, description, sort_order")
      .order("sort_order"),
    supabase
      .from("sub_attributes")
      .select("id, parent_attribute_id, name, description, effect_per_point, effect_unit, sort_order")
      .order("sort_order"),
  ]);
  if (attrsRes.error) throw new Error(`attributes load failed: ${attrsRes.error.message}`);
  if (subsRes.error) throw new Error(`sub_attributes load failed: ${subsRes.error.message}`);

  const attrs = (attrsRes.data ?? []) as AttributeCatalogRow[];
  const subs = (subsRes.data ?? []) as SubAttributeCatalogRow[];

  // Pull localized name + description in a single query per entity type.
  const trMap = new Map<string, { name?: string; description?: string }>();
  if (locale !== "en") {
    const allIds = [...attrs.map((a) => a.id), ...subs.map((s) => s.id)];
    const [tA, tS] = await Promise.all([
      supabase
        .from("translations")
        .select("entity_id, field, value")
        .eq("entity_type", "attribute")
        .eq("locale", locale)
        .in("entity_id", allIds),
      supabase
        .from("translations")
        .select("entity_id, field, value")
        .eq("entity_type", "sub_attribute")
        .eq("locale", locale)
        .in("entity_id", allIds),
    ]);
    for (const row of [...(tA.data ?? []), ...(tS.data ?? [])]) {
      const id = row.entity_id as string;
      const field = row.field as string;
      const value = row.value as string;
      const entry = trMap.get(id) ?? {};
      if (field === "name") entry.name = value;
      else if (field === "description") entry.description = value;
      trMap.set(id, entry);
    }
  }

  // Group sub-attrs by parent, preserving sort_order.
  const subsByParent = new Map<string, SubAttributeCatalogRow[]>();
  for (const s of subs) {
    const list = subsByParent.get(s.parent_attribute_id) ?? [];
    list.push(s);
    subsByParent.set(s.parent_attribute_id, list);
  }

  return attrs.map<AttributeBreakdownGroup>((a) => {
    const parentField = PARENT_TO_FIELD[a.id];
    const parentValue = parentField ? character[parentField] : 0;
    const tr = trMap.get(a.id);
    const childSubs = (subsByParent.get(a.id) ?? []).map((s) => {
      const subTr = trMap.get(s.id);
      const derived =
        s.effect_per_point !== null
          ? round2(parentValue * Number(s.effect_per_point))
          : null;
      return {
        id: s.id,
        name_localized: subTr?.name ?? s.name,
        description_localized: subTr?.description ?? s.description,
        effect_per_point: s.effect_per_point !== null ? Number(s.effect_per_point) : null,
        effect_unit: s.effect_unit,
        derived_value: derived,
      };
    });
    return {
      id: a.id,
      abbrev: a.abbrev,
      name_localized: tr?.name ?? a.name,
      description_localized: tr?.description ?? a.description,
      value: parentValue,
      sub_attributes: childSubs,
    };
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
