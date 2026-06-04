/**
 * Phase 4d-v2 — replace the old top-down-derived combat sprites with
 * the new dedicated side-view set:
 *   - chibi Damned Warrior   (classes.warrior)
 *   - detailed Centaur       (monsters.centaur_warrior)
 *   - detailed Lizardman     (monsters.lizardman_archer)
 *
 * Each character gets a fresh combat_sprite_atlas + combat_animation_atlas:
 *   - idle   = fight-stance-idle-8-frames (FFVI / Octopath combat
 *              breath instead of the passive breathing-idle so the
 *              attack starts from the same pose, no visual jolt)
 *   - attack = cross-punch (warriors) / bow_shoot_combat v3 (archer)
 *   - hurt   = taking-punch
 *   - death  = falling-back-death
 *
 * Player needs west-facing; mobs need east-facing. The mob_assets on
 * the encounter trigger prop is re-synced so the cutscene preloader
 * picks the new art up on the next room load.
 *
 * Fill IDs after the PixelLab notification + rerun.
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
  facing: "east" | "west";
  anims: AnimSpec[];
};

const SPECS: CharSpec[] = [
  {
    table: "classes",
    entityId: "warrior",
    // Chibi Damned Warrior (v2 — replaces 32d2a4fc).
    characterId: "0eb4fd61-4d4c-43f9-908a-371038c0faec",
    facing: "west",
    anims: [
      { key: "idle",   animationId: "85c6f2d1-d110-479e-be0a-dfd5ca9488e3", frameCount: 8 },
      { key: "attack", animationId: "80dacb7a-55b7-4f86-9c10-b0d86262ce73", frameCount: 6 },
      { key: "hurt",   animationId: "818fd9c6-cf94-4efc-a22e-b81d7b4e3e7a", frameCount: 6 },
      { key: "death",  animationId: "8a2cb427-ba3f-4923-92e0-c9bbebecafc9", frameCount: 7 },
    ],
  },
  {
    table: "monsters",
    entityId: "centaur_warrior",
    // Detailed Centaur (v2 — replaces 59ad050f).
    characterId: "189a375c-ff05-4611-b008-7f371f29b7f4",
    facing: "east",
    anims: [
      { key: "idle",   animationId: "47523e3a-71e7-43d8-af0d-2bb3f7adb7bd", frameCount: 8 },
      { key: "attack", animationId: "d1f4334d-6bb4-4f0a-9d01-37d9727a697b", frameCount: 6 },
      { key: "hurt",   animationId: "819e058d-c394-425e-b253-c5bd67e5ca8c", frameCount: 6 },
      { key: "death",  animationId: "66688d0c-0b22-45c8-aa45-307987933e26", frameCount: 7 },
    ],
  },
  {
    table: "monsters",
    entityId: "lizardman_archer",
    // Detailed Archer (v2 — replaces be888821).
    characterId: "b210c895-d63b-4aab-a9ce-b4ddff94d41d",
    facing: "east",
    anims: [
      { key: "idle",   animationId: "a91f3c13-c2b7-4b52-9383-d89042189bfb", frameCount: 8 },
      // bow_shoot_combat is custom v3 (1 ref + 8 animated = 9 total).
      { key: "attack", animationId: "91217a83-81fe-4c38-a731-7c77762671b8", frameCount: 9 },
      { key: "hurt",   animationId: "f2555cb0-2327-4857-883f-2bcbcc2fff9b", frameCount: 6 },
      { key: "death",  animationId: "bc002148-57cd-49e0-be74-17adb4191fb1", frameCount: 7 },
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
    console.log(`\n=== ${spec.table}/${spec.entityId} v2 (${spec.facing}) ===`);

    // a) Base side-view sprite (single direction).
    const spriteUrl = `${CHAR_BUCKET}/${spec.characterId}/rotations/${spec.facing}.png`;
    const spriteBuf = await dl(spriteUrl);
    const spriteReg = await registerAsset(sb, {
      data: spriteBuf,
      contentType: "image/png",
      entityType: spec.table === "classes" ? "class" : "monster",
      entityId: spec.entityId,
      field: `combat_v2_${spec.facing}`,
      prompt: `${spec.entityId} v2 side-view combat sprite (${spec.facing})`,
      endpoint: "pixellab_mcp",
      generationSize: "auto",
      generatedVia: "mcp",
      metadata: { pixellab_character_id: spec.characterId, version: 2, direction: spec.facing },
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
          field: `combat_v2_${anim.key}_${spec.facing}_${i}`,
          prompt: `${spec.entityId} v2 combat ${anim.key} ${spec.facing} frame ${i}`,
          endpoint: "mcp_animate_character",
          generationSize: "auto",
          generatedVia: "mcp",
          metadata: { pixellab_character_id: spec.characterId, animation_id: anim.animationId, direction: spec.facing, frame_index: i, version: 2 },
        });
        frames.push(reg.url);
        process.stdout.write(reg.alreadyExisted ? "·" : "+");
      }
      process.stdout.write(` ${anim.key} (${anim.frameCount}f)\n`);
      combatAnimAtlas[anim.key] = { [spec.facing]: frames };
    }

    // c) Persist — REPLACE the old combat_* atlases. Old extra keys
    //    (skill/block/dodge/victory for warrior) are intentionally
    //    dropped; they'll be regenerated with the new chibi body in
    //    a follow-up batch.
    const { error: upErr } = await sb
      .from(spec.table)
      .update({
        combat_sprite_atlas: combatSpriteAtlas,
        combat_animation_atlas: combatAnimAtlas,
      })
      .eq("id", spec.entityId);
    if (upErr) throw upErr;
    console.log(`  ✓ ${spec.table}.${spec.entityId} combat_* atlases REPLACED with v2 art`);
  }

  // d) Re-sync the encounter prop's mob_assets so the cutscene
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
  console.log("\n✓ encounter prop mob_assets re-synced with v2 art");
})().catch((err) => { console.error(err); process.exit(1); });
