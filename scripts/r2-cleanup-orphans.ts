/**
 * Sweep R2 for orphan assets, archive them locally, then delete from R2.
 *
 * "Orphan" = an `asset_generations` row whose `output_r2_url` is no longer
 * referenced by any production table (today: `classes.portrait_url`; future
 * phases will append `monsters.sprite_url`, `npcs.portrait_url`, etc. — add
 * them to REFERENCING_COLUMNS below).
 *
 * Each orphan is:
 *   1. Downloaded to `.local-r2-archive/<entity>--<id>--<field>--<date>--<hash8>.png`
 *      (gitignored — kept locally so we can review old generations any time).
 *   2. Deleted from R2.
 *   3. Stamped `deleted_from_r2_at` in `asset_generations` (audit row stays
 *      with prompt + cost + hash for reproducibility).
 *
 * Usage:  pnpm cleanup-r2
 */

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { deleteFromR2 } from "../lib/r2/delete";

loadEnv({ path: ".env.local" });

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const REFERENCING_COLUMNS: { table: string; column: string }[] = [
  { table: "classes", column: "portrait_url" },
];

const ARCHIVE_DIR = path.resolve(".local-r2-archive");

function buildArchiveFilename(g: {
  entity_type: string;
  entity_id: string;
  field: string;
  generated_at: string;
  output_r2_key: string;
}): string {
  const date = g.generated_at.replace(/[:.]/g, "-").slice(0, 19); // YYYY-MM-DDTHH-MM-SS
  const ext = path.extname(g.output_r2_key) || ".bin";
  const hash8 = path.basename(g.output_r2_key, ext).slice(0, 8);
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safe(g.entity_type)}--${safe(g.entity_id)}--${safe(g.field)}--${date}--${hash8}${ext}`;
}

async function main() {
  const t0 = Date.now();
  await mkdir(ARCHIVE_DIR, { recursive: true });

  const protectedUrls = new Set<string>();
  for (const ref of REFERENCING_COLUMNS) {
    const { data, error } = await supabase
      .from(ref.table)
      .select(ref.column)
      .not(ref.column, "is", null);
    if (error) throw new Error(`select ${ref.table}.${ref.column}: ${error.message}`);
    for (const row of data ?? []) {
      const value = (row as unknown as Record<string, string | null>)[ref.column];
      if (value) protectedUrls.add(value);
    }
  }
  console.log(`protected URLs (currently in production): ${protectedUrls.size}`);
  console.log(`local archive dir: ${ARCHIVE_DIR}`);

  const { data: gens, error: gErr } = await supabase
    .from("asset_generations")
    .select(
      "id, output_r2_key, output_r2_url, entity_type, entity_id, field, generated_at",
    )
    .is("deleted_from_r2_at", null)
    .order("generated_at", { ascending: true });
  if (gErr) throw new Error(`select asset_generations: ${gErr.message}`);
  console.log(`live generations in audit log: ${gens?.length ?? 0}\n`);

  let archived = 0;
  let kept = 0;
  let downloadFailures = 0;
  let r2Failures = 0;

  for (const raw of gens ?? []) {
    const g = raw as {
      id: string;
      output_r2_key: string;
      output_r2_url: string;
      entity_type: string;
      entity_id: string;
      field: string;
      generated_at: string;
    };
    if (protectedUrls.has(g.output_r2_url)) {
      kept++;
      continue;
    }

    const filename = buildArchiveFilename(g);
    const archivePath = path.join(ARCHIVE_DIR, filename);
    process.stdout.write(`  orphan ${g.entity_type}/${g.entity_id} ${g.output_r2_key}\n`);

    // 1. Download to local archive.
    try {
      const res = await fetch(g.output_r2_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(archivePath, buf);
      process.stdout.write(`    archived: ${filename} (${buf.byteLength} bytes)\n`);
    } catch (err) {
      downloadFailures++;
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`    download FAILED (${msg}); skipping delete to avoid data loss\n`);
      continue;
    }

    // 2. Delete from R2.
    try {
      await deleteFromR2(g.output_r2_key);
      process.stdout.write(`    R2 deleted\n`);
    } catch (err) {
      r2Failures++;
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`    R2 delete FAILED (${msg})\n`);
    }

    // 3. Mark audit row.
    const { error: uErr } = await supabase
      .from("asset_generations")
      .update({ deleted_from_r2_at: new Date().toISOString() })
      .eq("id", g.id);
    if (uErr) throw new Error(`audit mark failed for ${g.id}: ${uErr.message}`);
    archived++;
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `\nDone in ${elapsed}s.\n` +
      `  ${archived} archived locally + R2-deleted\n` +
      `  ${kept} active, kept in production\n` +
      (downloadFailures > 0 ? `  ${downloadFailures} download failures (NOT deleted)\n` : "") +
      (r2Failures > 0 ? `  ${r2Failures} R2-delete failures (audit still marked)\n` : ""),
  );
  console.log(`Archive folder: ${ARCHIVE_DIR}`);
}

main().catch((err) => {
  console.error("\nCleanup failed:", err);
  process.exit(1);
});
