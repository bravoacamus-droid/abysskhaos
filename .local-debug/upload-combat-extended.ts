/**
 * Phase 4d — extended combat anims (Tier 1 + extended states the
 * user listed): hurt, death, victory, skill, block, dodge per
 * character. Merges into the existing classes/monsters
 * combat_animation_atlas without clobbering idle / attack already
 * registered by upload-combat-sideview.ts.
 *
 * Also re-uploads the higher-resolution combat backdrop (256×256)
 * and patches the encounter prop metadata so the cinematic stays
 * sharp at full screen.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const PROJECT_ID = "8d5dc016-f9f1-4d60-b597-face41b54459";
const CHAR_BUCKET = `https://backblaze.pixellab.ai/file/pixellab-characters/${PROJECT_ID}`;
const OBJ_BUCKET = `https://backblaze.pixellab.ai/file/pixellab-characters/objects/${PROJECT_ID}`;

const BACKDROP_OBJ_ID = "93921861-f3f1-4ec1-86cb-b96c3b058388";
const BACKDROP_URL = `${OBJ_BUCKET}/${BACKDROP_OBJ_ID}/rotations/unknown.png`;

type AnimSpec = {
  key: string;            // logical name in combat_animation_atlas
  animationId: string;    // PixelLab animation_id
  frameCount: number;
};

type CharSpec = {
  table: "monsters" | "classes";
  entityId: string;
  characterId: string;
  facing: "east" | "west";
  anims: AnimSpec[];
};

const SPECS: CharSpec[] = [
  {
    table: "classes",
    entityId: "warrior",
    characterId: "32d2a4fc-6c63-4ac7-941b-03aa6eb03a38",
    facing: "west",
    anims: [
      { key: "hurt",    animationId: "83a3291e-45af-4b96-982f-ece4c059657c", frameCount: 6 },
      { key: "death",   animationId: "0924925e-5515-4fd3-8014-f904060849e7", frameCount: 7 },
      { key: "victory", animationId: "e3cca986-e69f-4f8c-a171-9b6ce3eb14b2", frameCount: 7 },
      { key: "skill",   animationId: "ef59975a-deac-472c-8031-49ed691f676f", frameCount: 9 },
      { key: "block",   animationId: "41fd9c8d-65b6-4fd0-86f4-b904ac0df3bb", frameCount: 5 },
      { key: "dodge",   animationId: "f20e5ce3-0065-4fd3-86d4-8f114b7617d2", frameCount: 7 },
    ],
  },
  {
    table: "monsters",
    entityId: "centaur_warrior",
    characterId: "59ad050f-a02f-4d4b-95f5-28a2ca86c2ef",
    facing: "east",
    anims: [
      { key: "hurt",  animationId: "c6ef8ceb-3745-40ba-aa32-878d26e5cc30", frameCount: 6 },
      { key: "death", animationId: "a0fdb3b1-bf2a-4150-86de-756f6cabb898", frameCount: 7 },
    ],
  },
  {
    table: "monsters",
    entityId: "lizardman_archer",
    characterId: "be888821-ca15-4e21-b9b1-9386d2df7ff8",
    facing: "east",
    anims: [
      { key: "hurt",  animationId: "24c93724-addc-4bf8-ab00-ca6bafa5c948", frameCount: 6 },
      { key: "death", animationId: "cc68b603-6508-4928-ac10-76a6d64b9722", frameCount: 7 },
    ],
  },
];

async function dl(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

(async () => {
  // 1) New high-res backdrop.
  console.log("=== combat backdrop v2 (256×256) ===");
  const bdBuf = await dl(BACKDROP_URL);
  const bdReg = await registerAsset(sb, {
    data: bdBuf,
    contentType: "image/png",
    entityType: "encounter",
    entityId: "f100_r02_bridge_ambush",
    field: "combat_backdrop_v2",
    prompt: "256×256 cinematic cave backdrop for r02 ambush; PixelLab object 93921861.",
    endpoint: "pixellab_mcp",
    generationSize: "256x256",
    generatedVia: "mcp",
    metadata: { pixellab_object_id: BACKDROP_OBJ_ID, version: 2 },
  });
  console.log(bdReg.alreadyExisted ? "cache hit" : "uploaded", bdReg.url);

  const { data: propRow0, error: pSel0 } = await sb
    .from("props")
    .select("metadata")
    .eq("id", "encounter_trigger_centaur_archer")
    .single();
  if (pSel0) throw pSel0;
  const propMeta0 = { ...(propRow0.metadata as Record<string, unknown>), combat_backdrop_url: bdReg.url };
  const { error: pUp0 } = await sb
    .from("props")
    .update({ metadata: propMeta0 })
    .eq("id", "encounter_trigger_centaur_archer");
  if (pUp0) throw pUp0;
  console.log("✓ encounter prop combat_backdrop_url updated to v2");

  // 2) Per-character anim merges.
  for (const spec of SPECS) {
    console.log(`\n=== ${spec.table}/${spec.entityId} (${spec.facing}) ===`);
    const { data: row, error: rErr } = await sb
      .from(spec.table)
      .select("combat_animation_atlas")
      .eq("id", spec.entityId)
      .single();
    if (rErr) throw rErr;
    const atlas: Record<string, Record<string, string[]>> =
      (row.combat_animation_atlas as Record<string, Record<string, string[]>> | null) ?? {};

    for (const anim of spec.anims) {
      if (anim.animationId.startsWith("FILL_")) {
        console.log(`  [${anim.key}] SKIP — id not filled`);
        continue;
      }
      const dirMap: Record<string, string[]> = { ...(atlas[anim.key] ?? {}) };
      const frames: string[] = [];
      for (let i = 0; i < anim.frameCount; i++) {
        const url = `${CHAR_BUCKET}/${spec.characterId}/animations/${anim.animationId}/${spec.facing}/${i}.png`;
        const buf = await dl(url);
        const reg = await registerAsset(sb, {
          data: buf,
          contentType: "image/png",
          entityType: spec.table === "classes" ? "class" : "monster",
          entityId: spec.entityId,
          field: `combat_${anim.key}_${spec.facing}_${i}`,
          prompt: `${spec.entityId} combat ${anim.key} ${spec.facing} frame ${i}`,
          endpoint: "mcp_animate_character",
          generationSize: "auto",
          generatedVia: "mcp",
          metadata: { pixellab_character_id: spec.characterId, animation_id: anim.animationId, direction: spec.facing, frame_index: i },
        });
        frames.push(reg.url);
        process.stdout.write(reg.alreadyExisted ? "·" : "+");
      }
      process.stdout.write(` ${anim.key} (${anim.frameCount}f)\n`);
      dirMap[spec.facing] = frames;
      atlas[anim.key] = dirMap;
    }

    const { error: upErr } = await sb
      .from(spec.table)
      .update({ combat_animation_atlas: atlas })
      .eq("id", spec.entityId);
    if (upErr) throw upErr;
    console.log(`  ✓ ${spec.table}.${spec.entityId} merged keys: ${Object.keys(atlas).join(", ")}`);
  }

  // 3) Re-sync mob_assets on the encounter prop.
  const { data: monsterRows, error: mErr } = await sb
    .from("monsters")
    .select("id, sprite_atlas, animation_atlas, combat_sprite_atlas, combat_animation_atlas")
    .in("id", ["centaur_warrior", "lizardman_archer"]);
  if (mErr) throw mErr;
  const mobAssets = monsterRows!.map((m) => ({
    id: m.id as string,
    sprite_atlas: m.sprite_atlas,
    animation_atlas: m.animation_atlas,
    combat_sprite_atlas: m.combat_sprite_atlas,
    combat_animation_atlas: m.combat_animation_atlas,
  }));
  const meta = { ...propMeta0, mob_assets: mobAssets };
  const { error: pUp1 } = await sb
    .from("props")
    .update({ metadata: meta })
    .eq("id", "encounter_trigger_centaur_archer");
  if (pUp1) throw pUp1;
  console.log("\n✓ encounter prop mob_assets re-synced");
})().catch((err) => { console.error(err); process.exit(1); });
