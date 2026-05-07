/**
 * Shared types for Phase 1 seed scripts.
 *
 * The canonical content (English) lives in the table columns directly.
 * Translations to other locales live alongside as `i18n` maps and are
 * inserted into the `translations` table by the seed runner.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** A 2-letter locale code from `supported_locales`. */
export type Locale =
  | "en"
  | "es"
  | "pt"
  | "ru"
  | "zh"
  | "ja"
  | "fr"
  | "de"
  | "hi"
  | "tl";

/** Per-locale field map. Keys are field names ('name', 'description'), values
 * are the translated text. Missing locales fall back to the canonical column. */
export type LocaleFields = Partial<Record<string, string>>;

/** Per-record translations: { es: { name: '...', description: '...' }, pt: {...} } */
export type RecordTranslations = Partial<Record<Locale, LocaleFields>>;

/** Translation row as stored in the `translations` table. */
export type TranslationRow = {
  entity_type: string;
  entity_id: string;
  locale: Locale;
  field: string;
  value: string;
};

export type SeedReport = {
  table: string;
  rows: number;
  translations: number;
};

export type SeedFn = (client: SupabaseClient) => Promise<SeedReport[]>;

/**
 * Helper: flatten a per-record translations map into rows for the
 * `translations` table.
 */
export function expandTranslations(
  entityType: string,
  records: { id: string; i18n?: RecordTranslations }[],
): TranslationRow[] {
  const out: TranslationRow[] = [];
  for (const r of records) {
    if (!r.i18n) continue;
    for (const [localeKey, fields] of Object.entries(r.i18n)) {
      if (!fields) continue;
      const locale = localeKey as Locale;
      for (const [field, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        out.push({ entity_type: entityType, entity_id: r.id, locale, field, value });
      }
    }
  }
  return out;
}

/**
 * Upsert canonical rows + their translations in two atomic-ish batches.
 * Strips `i18n` from canonical rows before sending to Postgres.
 */
export async function upsertWithI18n(
  client: SupabaseClient,
  table: string,
  entityType: string,
  rows: readonly { id: string; i18n?: RecordTranslations }[],
): Promise<SeedReport> {
  const canonical: Record<string, unknown>[] = rows.map((r) => {
    const copy: Record<string, unknown> = { ...r };
    delete copy.i18n;
    return copy;
  });
  const { error: upsertErr } = await client.from(table).upsert(canonical, { onConflict: "id" });
  if (upsertErr) throw new Error(`upsert ${table}: ${upsertErr.message}`);

  const translations = expandTranslations(entityType, rows as { id: string; i18n?: RecordTranslations }[]);
  if (translations.length > 0) {
    const { error: tErr } = await client
      .from("translations")
      .upsert(translations, { onConflict: "entity_type,entity_id,locale,field" });
    if (tErr) throw new Error(`upsert translations for ${table}: ${tErr.message}`);
  }

  return { table, rows: canonical.length, translations: translations.length };
}
