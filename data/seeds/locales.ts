/**
 * Supported locales — single source of truth for the language switcher.
 * English is canonical; Spanish is the design-source language and ships
 * fully translated at launch. The other 8 are stubs that fall back to en
 * until Phase 13's i18n pass.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const supportedLocales = [
  { id: "en", name_native: "English", name_en: "English", is_canonical: true, is_active: true, sort_order: 1 },
  { id: "es", name_native: "Español", name_en: "Spanish", is_canonical: false, is_active: true, sort_order: 2 },
  { id: "pt", name_native: "Português", name_en: "Portuguese", is_canonical: false, is_active: true, sort_order: 3 },
  { id: "ru", name_native: "Русский", name_en: "Russian", is_canonical: false, is_active: true, sort_order: 4 },
  { id: "zh", name_native: "中文", name_en: "Chinese", is_canonical: false, is_active: true, sort_order: 5 },
  { id: "ja", name_native: "日本語", name_en: "Japanese", is_canonical: false, is_active: true, sort_order: 6 },
  { id: "fr", name_native: "Français", name_en: "French", is_canonical: false, is_active: true, sort_order: 7 },
  { id: "de", name_native: "Deutsch", name_en: "German", is_canonical: false, is_active: true, sort_order: 8 },
  { id: "hi", name_native: "हिन्दी", name_en: "Hindi", is_canonical: false, is_active: true, sort_order: 9 },
  { id: "tl", name_native: "Tagalog", name_en: "Filipino (Tagalog)", is_canonical: false, is_active: true, sort_order: 10 },
] as const;

export async function seedLocales(client: SupabaseClient) {
  const { error } = await client
    .from("supported_locales")
    .upsert(supportedLocales, { onConflict: "id" });
  if (error) throw new Error(`upsert supported_locales: ${error.message}`);
  return { table: "supported_locales", rows: supportedLocales.length, translations: 0 };
}
