/**
 * Phase 3b: pull the assets generated via PixelLab MCP into R2.
 *
 * This script is a one-shot per (character_id / tileset_id). For each:
 *   1. fetch every rotation PNG from backblaze CDN (public)
 *   2. content-hash each, upload to R2, register in `asset_generations`
 *   3. write the resulting URL atlas into the right DB column
 *
 * Run with:  pnpm tsx scripts/fetch-mcp-assets.ts
 *
 * Mutate the JOBS list at the top to (re-)pull a different set of MCP IDs.
 * Idempotent because the upload is content-addressed — re-running with the
 * same bytes hits the existing R2 object and short-circuits.
 */

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

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

type CharacterJob = {
  kind: "character";
  /** PixelLab character UUID */
  characterId: string;
  /** Where to store the resulting atlas */
  target:
    | { table: "classes"; id: string }
    | { table: "npcs"; id: string };
  /** Reused for the asset_generations entity_id */
  entityId: string;
  /** Reused for label + prompt audit */
  label: string;
  prompt: string;
};

type TilesetJob = {
  kind: "tileset";
  tilesetId: string;
  biomeId: string;
  label: string;
  prompt: string;
};

const JOBS: Array<CharacterJob | TilesetJob> = [
  {
    kind: "character",
    characterId: "930b1d61-3306-4e7d-bdef-876a4ac43a6e",
    target: { table: "classes", id: "warrior" },
    entityId: "warrior",
    label: "Camus the Warrior (walking sprite)",
    prompt:
      "muscular human warrior, heavy iron plate armor with crimson trim, two-handed sword on back, top-down 4-direction sprite — mood:serious",
  },
  {
    kind: "character",
    characterId: "fdd5ae89-9e84-45fb-8cd7-1eefddfa43c8",
    target: { table: "npcs", id: "cedric_the_broken" },
    entityId: "cedric_the_broken",
    label: "Cedric the Broken (walking sprite)",
    prompt:
      "weathered ex-gladiator, missing left arm, leather smithing apron, top-down 4-direction sprite — mood:serious",
  },
  {
    kind: "tileset",
    tilesetId: "b9a438b4-9aaa-4af2-b993-33f1b7f20b37",
    biomeId: "threshold",
    label: "Threshold biome Wang tileset",
    prompt:
      "Wang tileset 16 tiles, dark obsidian floor with violet bioluminescent veins → black volcanic stone walls",
  },
];

async function downloadAsBuffer(url: string, headers?: Record<string, string>): Promise<Buffer> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function processCharacter(job: CharacterJob) {
  const directions: Direction[] = ["south", "north", "east", "west"];
  const baseUrl = `https://backblaze.pixellab.ai/file/pixellab-characters/8d5dc016-f9f1-4d60-b597-face41b54459/${job.characterId}/rotations`;

  const atlas: Record<Direction, string> = {} as Record<Direction, string>;
  for (const dir of directions) {
    const sourceUrl = `${baseUrl}/${dir}.png`;
    const buf = await downloadAsBuffer(sourceUrl);
    const registered = await registerAsset(supabase, {
      data: buf,
      contentType: "image/png",
      entityType: job.target.table === "classes" ? "class" : "npc",
      entityId: job.entityId,
      field: `sprite_${dir}`,
      prompt: job.prompt,
      endpoint: "mcp_create_character",
      generationSize: "68x68",
      generatedVia: "mcp",
      metadata: {
        label: job.label,
        direction: dir,
        mcp_character_id: job.characterId,
        view: "low top-down",
      },
    });
    atlas[dir] = registered.url;
    console.log(`  ${dir}: ${registered.alreadyExisted ? "cache hit" : "uploaded"} (${registered.bytes}b) ${registered.url}`);
  }

  const { error } = await supabase
    .from(job.target.table)
    .update({ sprite_atlas: atlas })
    .eq("id", job.target.id);
  if (error) throw new Error(`update ${job.target.table}.sprite_atlas: ${error.message}`);
}

async function processTileset(job: TilesetJob) {
  // The PixelLab MCP exposes the PNG + metadata via the api.pixellab.ai
  // route. Bearer auth is required.
  const authHeader = { Authorization: `Bearer ${pixellabKey}` };
  const pngUrl = `https://api.pixellab.ai/mcp/tilesets/${job.tilesetId}/image`;
  const metaUrl = `https://api.pixellab.ai/mcp/tilesets/${job.tilesetId}/metadata`;

  const [pngBuf, metaRes] = await Promise.all([
    downloadAsBuffer(pngUrl, authHeader),
    fetch(metaUrl, { headers: authHeader }),
  ]);
  if (!metaRes.ok) throw new Error(`fetch tileset metadata: HTTP ${metaRes.status}`);
  const metadata = (await metaRes.json()) as Record<string, unknown>;

  const registered = await registerAsset(supabase, {
    data: pngBuf,
    contentType: "image/png",
    entityType: "biome",
    entityId: job.biomeId,
    field: "tileset",
    prompt: job.prompt,
    endpoint: "mcp_create_topdown_tileset",
    generationSize: "64x64",
    generatedVia: "mcp",
    metadata: {
      label: job.label,
      mcp_tileset_id: job.tilesetId,
      tile_count: 16,
      tile_size: 16,
    },
  });
  console.log(`  tileset PNG: ${registered.alreadyExisted ? "cache hit" : "uploaded"} (${registered.bytes}b)`);

  const { error } = await supabase
    .from("biomes")
    .update({
      tileset_url: registered.url,
      tileset_metadata: metadata,
    })
    .eq("id", job.biomeId);
  if (error) throw new Error(`update biomes: ${error.message}`);
}

async function main() {
  const t0 = Date.now();
  for (const job of JOBS) {
    console.log(`\n[${job.kind}] ${job.label}`);
    if (job.kind === "character") {
      await processCharacter(job);
    } else {
      await processTileset(job);
    }
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s.`);
}

main().catch((err) => {
  console.error("\nFetch failed:", err);
  process.exit(1);
});
