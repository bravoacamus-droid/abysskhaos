/**
 * Phase 3c: download per-direction walk + idle animation frames from PixelLab,
 * upload each frame to R2 (content-hashed), and populate `animation_atlas`
 * on the matching `classes` / `npcs` row.
 *
 * The MCP export ZIP exposes animations under opaque `animating-XXXX` IDs
 * with no template name in metadata.json, so we identify which one is
 * "walking" vs "idle" by pixel-diffing south frame_000 vs frame_002. Walk
 * cycles swap leg poses → high diff. Breathing-idle barely moves → low diff.
 *
 * Run with:  pnpm tsx scripts/fetch-mcp-character-animations.ts
 */

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { PNG } from "pngjs";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pixellabKey = process.env.PIXELLAB_API_KEY;
if (!url || !serviceKey || !pixellabKey) {
  console.error("Missing env vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / PIXELLAB_API_KEY)");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

type Direction = "south" | "north" | "east" | "west";
const DIRECTIONS: Direction[] = ["south", "north", "east", "west"];

type Job = {
  characterId: string;
  /** Where to write sprite_atlas + animation_atlas */
  target: { table: "classes"; id: string } | { table: "npcs"; id: string };
  /** asset_generations entity_id */
  entityId: string;
  label: string;
  prompt: string;
};

const JOBS: Job[] = [
  {
    characterId: "3ab3593a-a4df-40c7-bd0e-9c29344cb8ce",
    target: { table: "classes", id: "warrior" },
    entityId: "warrior",
    label: "Camus warrior v3 octopath",
    prompt:
      "HD-2D pixel art warrior, Octopath Traveler / FF VI Pixel Remaster style, head ~1/3 of body, defined dark iron plate armor with crimson trim, two-handed sword on back, top-down 64px sprite",
  },
  {
    characterId: "69d030fa-fb6c-4b89-938c-757593554e67",
    target: { table: "npcs", id: "cedric_the_broken" },
    entityId: "cedric_the_broken",
    label: "Cedric NPC v3 octopath",
    prompt:
      "HD-2D pixel art ex-gladiator, Octopath Traveler / FF VI Pixel Remaster style, missing left arm, leather smithing apron, weathered face with grey-streaked beard, top-down 64px sprite",
  },
];

async function fetchZip(characterId: string): Promise<JSZip> {
  const res = await fetch(`https://api.pixellab.ai/mcp/characters/${characterId}/download`, {
    headers: { Authorization: `Bearer ${pixellabKey}` },
  });
  if (!res.ok) throw new Error(`zip fetch ${characterId}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`zip too small (${buf.length}B) — animations may still be pending`);
  return JSZip.loadAsync(buf);
}

type ZipMeta = {
  frames: {
    rotations: Record<Direction, string>;
    animations: Record<string, Record<Direction, string[]>>;
  };
};

async function readMetadata(zip: JSZip): Promise<ZipMeta> {
  const file = zip.file("metadata.json");
  if (!file) throw new Error("metadata.json missing from ZIP");
  return JSON.parse(await file.async("string")) as ZipMeta;
}

async function readPng(zip: JSZip, path: string): Promise<Buffer> {
  const file = zip.file(path);
  if (!file) throw new Error(`missing in ZIP: ${path}`);
  return file.async("nodebuffer");
}

/**
 * Sum of absolute RGBA differences between two PNGs of the same dimensions.
 * Walking cycles swap leg poses between frames → diff in the thousands.
 * Breathing-idle barely moves → diff well under 1000.
 */
function pixelDiff(a: Buffer, b: Buffer): number {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  if (pa.data.length !== pb.data.length) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let i = 0; i < pa.data.length; i++) {
    total += Math.abs((pa.data[i] ?? 0) - (pb.data[i] ?? 0));
  }
  return total;
}

/**
 * Classify the two animations in the ZIP as "walk" vs "idle" by total
 * frame-to-frame motion summed across all 4 directions. Walking cycles
 * legs through full extension on every frame → cumMotion in the 600k+
 * range. Breathing-idle barely moves → 200-300k. Single-direction
 * frame-0-vs-frame-2 is too noisy: PixelLab's walk template's antipodal
 * frames don't always fall on indices 0/2.
 */
async function classifyAnimations(
  zip: JSZip,
  meta: ZipMeta,
): Promise<{ walk: string; idle: string }> {
  const ids = Object.keys(meta.frames.animations);
  if (ids.length !== 2) {
    throw new Error(`expected 2 animations in ZIP, got ${ids.length}: ${ids.join(", ")}`);
  }
  const [idA, idB] = ids as [string, string];
  const scoreFor = async (id: string): Promise<number> => {
    const dirMap = meta.frames.animations[id];
    if (!dirMap) throw new Error(`no frames for ${id}`);
    let total = 0;
    for (const dir of DIRECTIONS) {
      const frames = dirMap[dir];
      if (!frames || frames.length < 2) continue;
      const bufs = await Promise.all(frames.map((p) => readPng(zip, p)));
      for (let i = 1; i < bufs.length; i++) {
        total += pixelDiff(bufs[i - 1]!, bufs[i]!);
      }
    }
    return total;
  };
  const [scoreA, scoreB] = await Promise.all([scoreFor(idA), scoreFor(idB)]);
  console.log(`    cumMotion: ${idA}=${scoreA}  ${idB}=${scoreB}`);
  if (scoreA > scoreB) return { walk: idA, idle: idB };
  return { walk: idB, idle: idA };
}

async function uploadFrame(
  zip: JSZip,
  path: string,
  job: Job,
  field: string,
  metadata: Record<string, unknown>,
): Promise<string> {
  const data = await readPng(zip, path);
  const registered = await registerAsset(supabase, {
    data,
    contentType: "image/png",
    entityType: job.target.table === "classes" ? "class" : "npc",
    entityId: job.entityId,
    field,
    prompt: job.prompt,
    endpoint: "mcp_animate_character",
    generationSize: "92x92",
    generatedVia: "mcp",
    metadata: {
      label: job.label,
      mcp_character_id: job.characterId,
      ...metadata,
    },
  });
  process.stdout.write(registered.alreadyExisted ? "·" : "+");
  return registered.url;
}

async function processJob(job: Job) {
  console.log(`\n[${job.target.table}.${job.target.id}] ${job.label}`);
  const zip = await fetchZip(job.characterId);
  const meta = await readMetadata(zip);

  console.log("  classifying walk vs idle…");
  const { walk: walkId, idle: idleId } = await classifyAnimations(zip, meta);
  console.log(`    walk=${walkId} idle=${idleId}`);

  // Static rotations → sprite_atlas (kept for back-compat).
  const spriteAtlas: Record<Direction, string> = {} as Record<Direction, string>;
  process.stdout.write("  rotations: ");
  for (const dir of DIRECTIONS) {
    const path = meta.frames.rotations[dir];
    if (!path) throw new Error(`rotation missing: ${dir}`);
    spriteAtlas[dir] = await uploadFrame(zip, path, job, `sprite_${dir}`, {
      direction: dir,
      kind: "rotation",
    });
  }
  process.stdout.write("\n");

  // Animation frames → animation_atlas.
  const animationAtlas: Record<string, Partial<Record<Direction, string[]>>> = {
    walk: {},
    idle: {},
  };
  for (const [animName, animId] of [
    ["walk", walkId],
    ["idle", idleId],
  ] as const) {
    process.stdout.write(`  ${animName}: `);
    const dirMap = meta.frames.animations[animId];
    if (!dirMap) throw new Error(`animation missing: ${animId}`);
    for (const dir of DIRECTIONS) {
      const paths = dirMap[dir];
      if (!paths) throw new Error(`${animName} ${dir} missing`);
      const urls: string[] = [];
      for (let i = 0; i < paths.length; i++) {
        const path = paths[i]!;
        const url = await uploadFrame(zip, path, job, `anim_${animName}_${dir}_${i}`, {
          direction: dir,
          kind: "animation",
          animation: animName,
          frame_index: i,
        });
        urls.push(url);
      }
      animationAtlas[animName]![dir] = urls;
    }
    process.stdout.write("\n");
  }

  const { error } = await supabase
    .from(job.target.table)
    .update({ sprite_atlas: spriteAtlas, animation_atlas: animationAtlas })
    .eq("id", job.target.id);
  if (error) throw new Error(`update ${job.target.table}.${job.target.id}: ${error.message}`);
  console.log(`  ✓ ${job.target.table}.${job.target.id} updated`);
}

async function main() {
  const t0 = Date.now();
  for (const job of JOBS) {
    await processJob(job);
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s.`);
}

main().catch((err) => {
  console.error("\nFetch failed:", err);
  process.exit(1);
});
