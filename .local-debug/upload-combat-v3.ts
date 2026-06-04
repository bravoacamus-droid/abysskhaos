/**
 * Phase 4d-v3 — Octopath HD-2D 3/4 view combat sprites.
 *
 * User-supplied art-direction brief: stop drawing the characters
 * in pure side profile (reads as 2D platformer), use 3/4 view
 * (south-east / south-west PixelLab directions) so the face AND
 * both shoulders are visible. That's the difference between
 * "platform sprite" and "JRPG battler".
 *
 * Each character:
 *   - Player (warrior): facing south-west (toward enemies on left)
 *   - Enemies (centaur, lizardman): facing south-east (toward player on right)
 *
 * Animations: idle + attack + hurt + death. v3 customs for idle +
 * attack so the motion progresses across distinct frames; template
 * for hurt/death (smaller flinch + collapse — fine from templates).
 *
 * Fill animationIds after generations complete, then re-run.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const PROJECT_ID = "8d5dc016-f9f1-4d60-b597-face41b54459";
const CHAR_BUCKET = `https://backblaze.pixellab.ai/file/pixellab-characters/${PROJECT_ID}`;

type AnimSpec = { key: string; animationId: string; frameCount: number };

type CharSpec = {
  table: "monsters" | "classes";
  entityId: string;
  characterId: string;
  /** PixelLab 8-direction key — "south-west" for player, "south-east" for enemies. */
  facing: "south-east" | "south-west";
  anims: AnimSpec[];
};

const SPECS: CharSpec[] = [
  {
    table: "classes",
    entityId: "warrior",
    characterId: "6d8cb2f1-d043-4845-8d7c-03565ba973d3",
    facing: "south-west",
    anims: [
      { key: "idle",   animationId: "0e84e52a-fe68-47ca-bec0-2ca72a5be63c", frameCount: 9 },
      { key: "attack", animationId: "b78b8cce-78c1-41d7-8dde-1d12e74f3ed9", frameCount: 11 },
      { key: "hurt",   animationId: "5ac6fe2d-75ca-4102-bb59-d3ab0e760910", frameCount: 6 },
      { key: "death",  animationId: "f3ed95a0-66e6-4033-8885-afb13024cd0e", frameCount: 7 },
    ],
  },
  {
    table: "monsters",
    entityId: "centaur_warrior",
    characterId: "4ff795f8-a5df-4d53-a277-4b017ac07016",
    facing: "south-east",
    anims: [
      { key: "idle",   animationId: "76797555-0996-455e-b5f3-0c1d4349f959", frameCount: 9 },
      { key: "attack", animationId: "dc06af4b-7e1d-4138-bbcd-3344d294fc12", frameCount: 11 },
      { key: "hurt",   animationId: "4dd9dd75-49f1-4c21-aaf6-1c26fbf116fb", frameCount: 6 },
      { key: "death",  animationId: "95e21862-7096-4b63-b236-3861deeb55fa", frameCount: 7 },
    ],
  },
  {
    table: "monsters",
    entityId: "lizardman_archer",
    characterId: "03575d7b-d6f1-4347-961e-cb38101337ac",
    facing: "south-east",
    anims: [
      { key: "idle",   animationId: "272d5a56-d7a1-4fed-81d1-3a5df642908c", frameCount: 9 },
      { key: "attack", animationId: "a6e2fb70-f0ae-48b3-b8e6-91a28e603cc9", frameCount: 11 },
      { key: "hurt",   animationId: "0090b468-5bf4-4ad0-9502-aac12ddc79de", frameCount: 6 },
      { key: "death",  animationId: "04392e17-4a30-48fa-a106-5bd9894f902d", frameCount: 7 },
    ],
  },
];

async function dl(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

(async () => {
  for (const spec of SPECS) {
    console.log(`\n=== ${spec.table}/${spec.entityId} v3 (${spec.facing}) ===`);

    const spriteUrl = `${CHAR_BUCKET}/${spec.characterId}/rotations/${spec.facing}.png`;
    const spriteBuf = await dl(spriteUrl);
    const spriteReg = await registerAsset(sb, {
      data: spriteBuf,
      contentType: "image/png",
      entityType: spec.table === "classes" ? "class" : "monster",
      entityId: spec.entityId,
      field: `combat_v3_${spec.facing}`,
      prompt: `${spec.entityId} v3 octopath 3/4 sprite (${spec.facing})`,
      endpoint: "pixellab_mcp",
      generationSize: "auto",
      generatedVia: "mcp",
      metadata: { pixellab_character_id: spec.characterId, version: 3, direction: spec.facing },
    });
    const combatSpriteAtlas: Record<string, string> = { [spec.facing]: spriteReg.url };
    console.log("  sprite", spriteReg.alreadyExisted ? "(cache hit)" : "(uploaded)");

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
          field: `combat_v3_${anim.key}_${spec.facing}_${i}`,
          prompt: `${spec.entityId} v3 octopath 3/4 combat ${anim.key} ${spec.facing} frame ${i}`,
          endpoint: "mcp_animate_character",
          generationSize: "auto",
          generatedVia: "mcp",
          metadata: { pixellab_character_id: spec.characterId, animation_id: anim.animationId, direction: spec.facing, frame_index: i, version: 3 },
        });
        frames.push(reg.url);
        process.stdout.write(reg.alreadyExisted ? "·" : "+");
      }
      process.stdout.write(` ${anim.key} (${anim.frameCount}f)\n`);
      combatAnimAtlas[anim.key] = { [spec.facing]: frames };
    }

    const { error: upErr } = await sb
      .from(spec.table)
      .update({
        combat_sprite_atlas: combatSpriteAtlas,
        combat_animation_atlas: combatAnimAtlas,
      })
      .eq("id", spec.entityId);
    if (upErr) throw upErr;
    console.log(`  ✓ ${spec.table}.${spec.entityId} combat_* atlases REPLACED with v3 art`);
  }

  // Re-sync the encounter prop's mob_assets.
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
  const { data: propRow, error: pSelErr } = await sb
    .from("props")
    .select("metadata")
    .eq("id", "encounter_trigger_centaur_archer")
    .single();
  if (pSelErr) throw pSelErr;
  const meta = { ...(propRow.metadata as Record<string, unknown>), mob_assets: mobAssets };
  const { error: pUpErr } = await sb
    .from("props")
    .update({ metadata: meta })
    .eq("id", "encounter_trigger_centaur_archer");
  if (pUpErr) throw pUpErr;
  console.log("\n✓ encounter prop mob_assets re-synced with v3 art");
})().catch((err) => { console.error(err); process.exit(1); });
