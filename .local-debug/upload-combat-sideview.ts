/**
 * Phase 4c — register all SIDE-VIEW combat assets:
 *   - Damned Warrior (combat_sprite_atlas + combat_animation_atlas on classes/warrior)
 *   - Centaur Warrior side-view (combat_* on monsters/centaur_warrior)
 *   - Lizardman Archer side-view (combat_* on monsters/lizardman_archer)
 *   - Bridge ambush combat backdrop (encounter_trigger_centaur_archer
 *     prop metadata.combat_backdrop_url)
 *
 * Each character gets the rotation that combat needs (west for the
 * player, east for the two enemies — combat is enemies-on-left,
 * player-on-right) plus its idle + attack animation frames.
 *
 * IDs to fill after the PixelLab notifications:
 *   - Damned Warrior  breathing-idle (west)  → FILL
 *   - Damned Warrior  cross-punch    (west)  → FILL
 *   - Centaur Warrior breathing-idle (east)  → FILL
 *   - Centaur Warrior cross-punch    (east)  → FILL
 *   - Lizardman       breathing-idle (east)  → FILL
 *   - Lizardman       bow_shoot_side (east, v3, 9f) → FILL
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const PROJECT_ID = "8d5dc016-f9f1-4d60-b597-face41b54459";
const CHAR_BUCKET = `https://backblaze.pixellab.ai/file/pixellab-characters/${PROJECT_ID}`;
const OBJ_BUCKET = `https://backblaze.pixellab.ai/file/pixellab-characters/objects/${PROJECT_ID}`;

type SideViewChar = {
  /** Table + id where atlases go ('monsters' or 'classes'). */
  table: "monsters" | "classes";
  entityId: string;
  /** PixelLab character id. */
  characterId: string;
  /** The direction this character uses in combat (east for enemies
   *  facing the player on the right; west for the player facing
   *  enemies on the left). We only register that one direction. */
  facing: "east" | "west";
  anims: {
    /** logical key in combat_animation_atlas: 'idle' | 'attack' */
    key: string;
    animationId: string;
    frameCount: number;
  }[];
};

const SPECS: SideViewChar[] = [
  {
    table: "classes",
    entityId: "warrior",
    characterId: "32d2a4fc-6c63-4ac7-941b-03aa6eb03a38",
    facing: "west",
    anims: [
      { key: "idle",   animationId: "5969ce78-6b6c-462e-a518-1fcc7f280c6d", frameCount: 4 },
      { key: "attack", animationId: "e388495b-0084-4778-9f1c-ff0144251b86", frameCount: 6 },
    ],
  },
  {
    table: "monsters",
    entityId: "centaur_warrior",
    characterId: "59ad050f-a02f-4d4b-95f5-28a2ca86c2ef",
    facing: "east",
    anims: [
      { key: "idle",   animationId: "a659f49f-11c8-4589-8245-67c0de719a12", frameCount: 4 },
      { key: "attack", animationId: "3fec866b-3035-4a71-8806-2e4cbd813205", frameCount: 6 },
    ],
  },
  {
    table: "monsters",
    entityId: "lizardman_archer",
    characterId: "be888821-ca15-4e21-b9b1-9386d2df7ff8",
    facing: "east",
    anims: [
      { key: "idle",   animationId: "ec616fd4-8083-4587-9579-4592b9772087", frameCount: 4 },
      { key: "attack", animationId: "4b8aaf9f-dcfc-4b20-8757-56495f810257", frameCount: 9 },
    ],
  },
];

/** Combat backdrop object selected from PixelLab (frame 2). */
const BACKDROP_OBJ_ID = "476e6ca4-6b4a-4f7c-bdbb-6d103e118935";
const BACKDROP_URL = `${OBJ_BUCKET}/${BACKDROP_OBJ_ID}/rotations/unknown.png`;

async function dl(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

(async () => {
  // 1) Backdrop first — independent of the character anims.
  console.log("=== combat backdrop (bridge ambush) ===");
  const bdBuf = await dl(BACKDROP_URL);
  const bdReg = await registerAsset(sb, {
    data: bdBuf,
    contentType: "image/png",
    entityType: "encounter",
    entityId: "f100_r02_bridge_ambush",
    field: "combat_backdrop",
    prompt: "Cinematic cave bridge backdrop for the r02 ambush combat scene; PixelLab object 476e6ca4 frame 2.",
    endpoint: "pixellab_mcp",
    generationSize: "128x128",
    generatedVia: "mcp",
    metadata: { pixellab_object_id: BACKDROP_OBJ_ID, frame: 2 },
  });
  console.log(bdReg.alreadyExisted ? "cache hit" : "uploaded", bdReg.url);

  // Patch the encounter trigger prop with the backdrop URL.
  const { data: propRow, error: propSelErr } = await sb
    .from("props")
    .select("metadata")
    .eq("id", "encounter_trigger_centaur_archer")
    .single();
  if (propSelErr) throw propSelErr;
  const propMeta = { ...(propRow.metadata as Record<string, unknown>), combat_backdrop_url: bdReg.url };
  const { error: propUpErr } = await sb
    .from("props")
    .update({ metadata: propMeta })
    .eq("id", "encounter_trigger_centaur_archer");
  if (propUpErr) throw propUpErr;
  console.log("✓ encounter prop combat_backdrop_url set");

  // 2) Each side-view character — base sprite + idle + attack.
  for (const spec of SPECS) {
    console.log(`\n=== ${spec.table}/${spec.entityId} (${spec.facing}-facing) ===`);

    // a) Base rotation (single direction).
    const spriteUrl = `${CHAR_BUCKET}/${spec.characterId}/rotations/${spec.facing}.png`;
    const spriteBuf = await dl(spriteUrl);
    const spriteReg = await registerAsset(sb, {
      data: spriteBuf,
      contentType: "image/png",
      entityType: spec.table === "classes" ? "class" : "monster",
      entityId: spec.entityId,
      field: `combat_${spec.facing}`,
      prompt: `${spec.entityId} side-view combat sprite (${spec.facing})`,
      endpoint: "pixellab_mcp",
      generationSize: "auto",
      generatedVia: "mcp",
      metadata: { pixellab_character_id: spec.characterId, mode: "v3", direction: spec.facing },
    });
    const combatSpriteAtlas: Record<string, string> = { [spec.facing]: spriteReg.url };
    console.log("  sprite", spriteReg.alreadyExisted ? "(cache hit)" : "(uploaded)");

    // b) Animation frames.
    const combatAnimAtlas: Record<string, Record<string, string[]>> = {};
    for (const anim of spec.anims) {
      if (anim.animationId.startsWith("FILL_")) {
        console.log(`  [${anim.key}] SKIP — id not filled`);
        continue;
      }
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
      combatAnimAtlas[anim.key] = { [spec.facing]: frames };
    }

    // c) Persist on the right table.
    const { error: upErr } = await sb
      .from(spec.table)
      .update({
        combat_sprite_atlas: combatSpriteAtlas,
        combat_animation_atlas: combatAnimAtlas,
      })
      .eq("id", spec.entityId);
    if (upErr) throw upErr;
    console.log(`  ✓ ${spec.table}.${spec.entityId} combat_* atlases set`);
  }

  // 3) Re-sync the encounter prop's mob_assets so the cutscene
  // preloader picks up the new combat atlases on next room load.
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
  const meta = { ...propMeta, mob_assets: mobAssets };
  const { error: pUpErr } = await sb
    .from("props")
    .update({ metadata: meta })
    .eq("id", "encounter_trigger_centaur_archer");
  if (pUpErr) throw pUpErr;
  console.log("\n✓ encounter prop mob_assets re-synced (with combat atlases)");
})().catch((err) => { console.error(err); process.exit(1); });
