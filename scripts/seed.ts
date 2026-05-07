/**
 * Phase 1 seed runner.
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local and applies
 * all canonical seeds (locales, reference enums, attributes, classes,
 * world, NPCs, bestiary, items). Idempotent — re-running upserts.
 *
 * Usage:  pnpm seed
 */

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { seedLocales } from "../data/seeds/locales";
import { seedReference } from "../data/seeds/reference";
import { seedAttributes } from "../data/seeds/attributes";
import { seedClasses } from "../data/seeds/classes";
import { seedWorld } from "../data/seeds/world";
import { seedNpcs } from "../data/seeds/npcs";
import { seedBestiary } from "../data/seeds/bestiary";
import { seedItems } from "../data/seeds/items";
import type { SeedReport } from "../data/seeds/_types";

loadEnv({ path: ".env.local" });

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const client = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

type Stage = { name: string; run: () => Promise<SeedReport | SeedReport[]> };

const stages: Stage[] = [
  { name: "locales",    run: () => seedLocales(client) },
  { name: "reference",  run: () => seedReference(client) },
  { name: "attributes", run: () => seedAttributes(client) },
  { name: "classes",    run: () => seedClasses(client) },
  { name: "world",      run: () => seedWorld(client) },
  { name: "npcs",       run: () => seedNpcs(client) },
  { name: "bestiary",   run: () => seedBestiary(client) },
  { name: "items",      run: () => seedItems(client) },
];

async function main() {
  const t0 = Date.now();
  let totalRows = 0;
  let totalTranslations = 0;

  for (const stage of stages) {
    const stageT0 = Date.now();
    const result = await stage.run();
    const reports = Array.isArray(result) ? result : [result];
    const stageRows = reports.reduce((acc, r) => acc + r.rows, 0);
    const stageTrans = reports.reduce((acc, r) => acc + r.translations, 0);
    totalRows += stageRows;
    totalTranslations += stageTrans;
    const elapsed = ((Date.now() - stageT0) / 1000).toFixed(1);
    const detail = reports.map((r) => `${r.table}=${r.rows}/${r.translations}`).join(" ");
    console.log(`[${stage.name}] ${detail}  (${elapsed}s)`);
  }

  const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `\nDone. ${totalRows} canonical rows + ${totalTranslations} translations in ${totalElapsed}s.`,
  );
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
