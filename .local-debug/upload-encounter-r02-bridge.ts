/**
 * Phase 4a — register the bridge-ambush encounter assets:
 *   - centaur_warrior  (4-dir sprite + 4-dir walking anim, ~6 frames each)
 *   - lizardman_archer (4-dir sprite + 4-dir walking anim, ~6 frames each)
 *   - encounter_trigger_centaur_archer prop (invisible, fires once)
 *
 * Writes:
 *   - monsters.{centaur_warrior, lizardman_archer}.sprite_atlas    jsonb
 *   - monsters.{centaur_warrior, lizardman_archer}.animation_atlas jsonb
 *   - props.encounter_trigger_centaur_archer
 *     {
 *       collision: false,
 *       sprite_url: 1x1 transparent png (renderer skips on invisible),
 *       metadata: {
 *         invisible_trigger: true,
 *         encounter_id: 'f100_r02_bridge_ambush',
 *         mob_ids: ['centaur_warrior', 'lizardman_archer'],
 *         mob_assets: [
 *           { id, sprite_atlas, animation_atlas }, ...
 *         ],
 *       },
 *     }
 *
 * Sources: PixelLab characters
 *   5d18c529-… (Centaur Warrior)
 *   58a86692-… (Lizardman Archer)
 *
 * Idempotent — re-runs use registerAsset's content-hash dedup.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { PNG } from "pngjs";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const PROJECT_ID = "8d5dc016-f9f1-4d60-b597-face41b54459";
const CHAR_BUCKET = `https://backblaze.pixellab.ai/file/pixellab-characters/${PROJECT_ID}`;

type CharSpec = {
  monsterId: string;
  characterId: string;
  /** animation_id per direction → list of frame_count frames. Filled
   *  by the `walks` lookup below from get_character's response. */
  walkAnims: Record<"south" | "east" | "north" | "west", { animationId: string; frameCount: number }>;
};

// Walk animation IDs per (character × direction) — pulled by hand from
// MCP get_character() after the animate_character jobs settled. Each
// direction got its own job ID; PixelLab assigns them independently so
// there is no shared id across directions.
const CHARS: CharSpec[] = [
  {
    monsterId: "centaur_warrior",
    characterId: "5d18c529-b10f-4998-a07f-1a02baa38a84",
    walkAnims: {
      south: { animationId: "994a1479-cbc9-4fdb-a389-cbbc6f57d841", frameCount: 6 },
      east:  { animationId: "127ee8da-4509-436e-b1d1-f7e4c30c3513", frameCount: 6 },
      north: { animationId: "9ed6c67f-e158-483f-bfc5-f1ad87ee2acd", frameCount: 6 },
      west:  { animationId: "2b0bbe5c-6008-4043-bb0b-bc6b9905b6cc", frameCount: 6 },
    },
  },
  {
    monsterId: "lizardman_archer",
    characterId: "58a86692-b0dd-4e83-a93d-e7ad6943a75b",
    walkAnims: {
      south: { animationId: "b2f98508-55b6-470d-8e74-2933b0778e2e", frameCount: 6 },
      east:  { animationId: "d5ada089-3579-4fe7-bf6d-e7f3053d5d44", frameCount: 6 },
      north: { animationId: "67e0a21b-f63a-42b2-932f-715ae08f7acb", frameCount: 6 },
      west:  { animationId: "d59e3805-f932-4dff-b76e-30f86f1fbaa8", frameCount: 6 },
    },
  },
];

const DIRECTIONS = ["south", "east", "north", "west"] as const;

async function dl(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Single 1x1 transparent PNG buffer, used as the invisible sprite
 *  for encounter trigger props. The scene's render path treats any
 *  prop with metadata.invisible_trigger as setVisible(false). */
function transparentPixel(): Buffer {
  const png = new PNG({ width: 1, height: 1 });
  png.data[0] = 0; png.data[1] = 0; png.data[2] = 0; png.data[3] = 0;
  return PNG.sync.write(png);
}

(async () => {
  // 1) Per-character asset registration.
  const mobAssetsForTrigger: Array<{ id: string; sprite_atlas: Record<string, string>; animation_atlas: Record<string, Record<string, string[]>> }> = [];

  for (const spec of CHARS) {
    console.log(`\n=== ${spec.monsterId} (${spec.characterId}) ===`);

    const spriteAtlas: Record<string, string> = {};
    const walkAtlas: Record<string, string[]> = {};

    for (const dir of DIRECTIONS) {
      // a) Static idle frame per direction.
      const idleUrl = `${CHAR_BUCKET}/${spec.characterId}/rotations/${dir}.png`;
      const idleBuf = await dl(idleUrl);
      const idleReg = await registerAsset(sb, {
        data: idleBuf,
        contentType: "image/png",
        entityType: "monster",
        entityId: spec.monsterId,
        field: `idle_${dir}`,
        prompt: `${spec.monsterId} static ${dir}-facing sprite`,
        endpoint: "pixellab_mcp",
        generationSize: "68x68",
        generatedVia: "mcp",
        metadata: { pixellab_character_id: spec.characterId, direction: dir },
      });
      spriteAtlas[dir] = idleReg.url;
      process.stdout.write(idleReg.alreadyExisted ? "·" : ".");

      // b) Walk animation frames per direction (when available).
      const anim = spec.walkAnims[dir];
      const walkFrames: string[] = [];
      if (anim.animationId) {
        for (let i = 0; i < anim.frameCount; i++) {
          const src = `${CHAR_BUCKET}/${spec.characterId}/animations/${anim.animationId}/${dir}/${i}.png`;
          const buf = await dl(src);
          const reg = await registerAsset(sb, {
            data: buf,
            contentType: "image/png",
            entityType: "monster",
            entityId: spec.monsterId,
            field: `walk_${dir}_${i}`,
            prompt: `${spec.monsterId} walk ${dir} frame ${i}`,
            endpoint: "mcp_animate_character",
            generationSize: "68x68",
            generatedVia: "mcp",
            metadata: { pixellab_character_id: spec.characterId, animation_id: anim.animationId, direction: dir, frame_index: i },
          });
          walkFrames.push(reg.url);
          process.stdout.write(reg.alreadyExisted ? "-" : "+");
        }
      }
      walkAtlas[dir] = walkFrames;
    }
    process.stdout.write("\n");

    const animationAtlas: Record<string, Record<string, string[]>> = { walk: walkAtlas };

    // c) Persist atlases on the monsters row.
    const { error: mErr } = await sb
      .from("monsters")
      .update({ sprite_atlas: spriteAtlas, animation_atlas: animationAtlas })
      .eq("id", spec.monsterId);
    if (mErr) throw mErr;
    console.log(`  ✓ monsters.${spec.monsterId} atlases set`);

    mobAssetsForTrigger.push({ id: spec.monsterId, sprite_atlas: spriteAtlas, animation_atlas: animationAtlas });
  }

  // 2) Invisible trigger prop.
  console.log("\n=== encounter_trigger_centaur_archer prop ===");
  const triggerSpriteReg = await registerAsset(sb, {
    data: transparentPixel(),
    contentType: "image/png",
    entityType: "prop",
    entityId: "encounter_trigger_centaur_archer",
    field: "sprite",
    prompt: "1x1 transparent placeholder for invisible encounter trigger",
    endpoint: "local_paint",
    generationSize: "1x1",
    generatedVia: "manual",
  });
  const { error: pErr } = await sb.from("props").upsert(
    {
      id: "encounter_trigger_centaur_archer",
      sprite_url: triggerSpriteReg.url,
      collision: false,
      display_scale: 1.0,
      metadata: {
        label: "Bridge Ambush Trigger (invisible)",
        invisible_trigger: true,
        encounter_id: "f100_r02_bridge_ambush",
        mob_ids: ["centaur_warrior", "lizardman_archer"],
        mob_assets: mobAssetsForTrigger,
      },
    },
    { onConflict: "id" },
  );
  if (pErr) throw pErr;
  console.log("✓ props.encounter_trigger_centaur_archer upserted with mob assets");
})().catch((err) => { console.error(err); process.exit(1); });
