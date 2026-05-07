/**
 * Verifies every locale dictionary contains the same keys as the canonical
 * (English). Catches the most common i18n bug: a translator forgetting to
 * add a key when the canonical adds one.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { SUPPORTED_LOCALES, t, pickLocale, CANONICAL_LOCALE } from "../lib/i18n";
import enMessages from "../messages/en.json";

function flatKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k === "$meta") continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null) {
      out.push(...flatKeys(v, key));
    } else {
      out.push(key);
    }
  }
  return out;
}

const canonicalKeys = new Set(flatKeys(enMessages));

for (const locale of SUPPORTED_LOCALES) {
  test(`locale '${locale}' has every canonical key`, async () => {
    const dict = (await import(`../messages/${locale}.json`)).default;
    const localeKeys = new Set(flatKeys(dict));
    const missing = [...canonicalKeys].filter((k) => !localeKeys.has(k));
    assert.deepEqual(missing, [], `locale ${locale} is missing keys: ${missing.join(", ")}`);
  });
}

test("t() falls back to canonical when key is missing in target locale", () => {
  // 'definitely_not_a_key' should pass through.
  const result = t("es", "definitely_not_a_key");
  assert.equal(result, "definitely_not_a_key");
});

test("t() substitutes {name} placeholders", () => {
  const result = t("en", "landing.welcome_named", { name: "Sir.Monkey" });
  assert.equal(result, "Welcome, Sir.Monkey");
  const resultEs = t("es", "landing.welcome_named", { name: "Sir.Monkey" });
  assert.equal(resultEs, "Bienvenido, Sir.Monkey");
});

test("pickLocale handles region prefixes (pt-br → pt)", () => {
  assert.equal(pickLocale("pt-br"), "pt");
  assert.equal(pickLocale("zh-Hant"), "zh");
  assert.equal(pickLocale("en-US"), "en");
});

test("pickLocale returns canonical for null/empty/unknown", () => {
  assert.equal(pickLocale(null), CANONICAL_LOCALE);
  assert.equal(pickLocale(""), CANONICAL_LOCALE);
  assert.equal(pickLocale("xx-YY"), CANONICAL_LOCALE);
});
