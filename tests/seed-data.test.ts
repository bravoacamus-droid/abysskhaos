/**
 * Static structural tests on the seed data files. These run in CI and don't
 * touch the database — they verify counts and referential integrity in TS
 * memory only. Catches design drift (e.g. a path that points to a class slug
 * that doesn't exist).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { supportedLocales } from "../data/seeds/locales";

test("supported_locales = 10 languages with exactly one canonical", () => {
  assert.equal(supportedLocales.length, 10);
  const canonicals = supportedLocales.filter((l) => l.is_canonical);
  assert.equal(canonicals.length, 1, "exactly one canonical locale");
  assert.equal(canonicals[0]?.id, "en", "English is canonical");
});

test("supported_locales include all 10 expected codes", () => {
  const ids = supportedLocales.map((l) => l.id).sort();
  assert.deepEqual(ids, ["de", "en", "es", "fr", "hi", "ja", "pt", "ru", "tl", "zh"]);
});

// Note: heavier integrity tests (paths→classes, sub_branches→hybrid_classes,
// floors→biomes, etc.) are added when the seeds grow. For Phase 1 the foreign
// keys are enforced by Postgres on insert, so a mismatched slug would already
// be caught by `pnpm seed`. We add structural tests here as a separate
// no-network safety net.
