/**
 * Lightweight i18n for the Abyss Mini App.
 *
 * Why custom and not next-intl: we ship 10 locales, each is a flat JSON map
 * imported statically. We need: a typed dictionary, locale selection driven
 * by Telegram language_code with a UI override, and {name}-style placeholder
 * substitution. That's ~30 lines of code; pulling next-intl would add 50kB
 * to the bundle for marginal value.
 */

import enMessages from "@/messages/en.json";
import esMessages from "@/messages/es.json";
import ptMessages from "@/messages/pt.json";
import ruMessages from "@/messages/ru.json";
import zhMessages from "@/messages/zh.json";
import jaMessages from "@/messages/ja.json";
import frMessages from "@/messages/fr.json";
import deMessages from "@/messages/de.json";
import hiMessages from "@/messages/hi.json";
import tlMessages from "@/messages/tl.json";

export const SUPPORTED_LOCALES = [
  "en",
  "es",
  "pt",
  "ru",
  "zh",
  "ja",
  "fr",
  "de",
  "hi",
  "tl",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const CANONICAL_LOCALE: Locale = "en";

/** Display metadata for the language switcher. */
export const LOCALE_INFO: Record<Locale, { native: string; en: string }> = {
  en: { native: "English",   en: "English" },
  es: { native: "Español",   en: "Spanish" },
  pt: { native: "Português", en: "Portuguese" },
  ru: { native: "Русский",   en: "Russian" },
  zh: { native: "中文",       en: "Chinese" },
  ja: { native: "日本語",     en: "Japanese" },
  fr: { native: "Français",  en: "French" },
  de: { native: "Deutsch",   en: "German" },
  hi: { native: "हिन्दी",       en: "Hindi" },
  tl: { native: "Tagalog",   en: "Filipino (Tagalog)" },
};

type Messages = typeof enMessages;

const dictionaries: Record<Locale, Messages> = {
  en: enMessages,
  es: esMessages as Messages,
  pt: ptMessages as Messages,
  ru: ruMessages as Messages,
  zh: zhMessages as Messages,
  ja: jaMessages as Messages,
  fr: frMessages as Messages,
  de: deMessages as Messages,
  hi: hiMessages as Messages,
  tl: tlMessages as Messages,
};

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Telegram passes language codes like 'es', 'en', 'pt-br'. Normalise to our set. */
export function pickLocale(telegramLanguageCode: string | null | undefined): Locale {
  if (!telegramLanguageCode) return CANONICAL_LOCALE;
  const lower = telegramLanguageCode.toLowerCase();
  // Direct match
  if (isSupportedLocale(lower)) return lower;
  // Region prefix (pt-br → pt)
  const prefix = lower.split(/[-_]/)[0];
  if (prefix && isSupportedLocale(prefix)) return prefix;
  return CANONICAL_LOCALE;
}

/** Resolve a dotted message key with substitution: t('landing.welcome_named', { name: 'Sir.Monkey' }). */
export function t(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const dict = dictionaries[locale] ?? dictionaries[CANONICAL_LOCALE];
  const fallback = dictionaries[CANONICAL_LOCALE];
  const value = (resolve(dict, key) ?? resolve(fallback, key)) as unknown;
  if (typeof value !== "string") return key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (_, name) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

function resolve(obj: unknown, key: string): unknown {
  const parts = key.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}
