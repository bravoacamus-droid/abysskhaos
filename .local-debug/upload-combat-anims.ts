/**
 * Phase 4b polish — register IDLE + ATTACK animation frames for the
 * centaur warrior + lizardman archer so the combat overlay can play
 * breathing-idle loops and (eventually) attack animations. Walk
 * frames are already in monsters.animation_atlas.walk; this script
 * merges 'idle' (4 dirs × 4 frames) + 'attack' (4 dirs × N frames
 * for centaur; 1 dir × 7 frames for archer v3 bow_shoot).
 *
 * Idempotent — content-hashed dedup via registerAsset, jsonb merge
 * preserves walk frames already set.
 *
 * Filled in after the PixelLab notifications:
 *   - Centaur breathing-idle anim IDs per direction
 *   - Centaur cross-punch  anim IDs per direction
 *   - Archer  breathing-idle anim IDs per direction
 *   - Archer  bow_shoot (custom v3) east anim ID
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const PROJECT_ID = "8d5dc016-f9f1-4d60-b597-face41b54459";
const CHAR_BUCKET = `https://backblaze.pixellab.ai/file/pixellab-characters/${PROJECT_ID}`;

type AnimSpec = {
  /** Logical key in monsters.animation_atlas (e.g. 'idle', 'attack'). */
  key: string;
  /** PixelLab animation_id per direction; missing dirs fall through. */
  perDir: Partial<Record<"south" | "east" | "north" | "west", { animationId: string; frameCount: number }>>;
};

type CharSpec = {
  monsterId: string;
  characterId: string;
  anims: AnimSpec[];
};

const CHARS: CharSpec[] = [
  {
    monsterId: "centaur_warrior",
    characterId: "5d18c529-b10f-4998-a07f-1a02baa38a84",
    anims: [
      {
        key: "idle",
        perDir: {
          south: { animationId: "d898ca51-6fe6-4f37-b755-148f00cefdfa", frameCount: 4 },
          east:  { animationId: "0f2bf068-7266-4f73-b4f0-78b6d538f0d7", frameCount: 4 },
          north: { animationId: "8077b926-1015-4a14-b144-c606fbde1cf4", frameCount: 4 },
          west:  { animationId: "4a2a528f-2d38-4c35-9d5c-dfabbf2d5c57", frameCount: 4 },
        },
      },
      {
        key: "attack",
        perDir: {
          south: { animationId: "ad51fa9b-54ff-4a93-ae22-cf8ce2acece3", frameCount: 6 },
          east:  { animationId: "1c5342f6-7733-44d7-825e-85c0c6966b49", frameCount: 6 },
          north: { animationId: "d4e094a4-b8d3-4886-b1e2-376f73a25c05", frameCount: 6 },
          west:  { animationId: "14ffb468-6834-48c1-852b-83b6a7bf360a", frameCount: 6 },
        },
      },
    ],
  },
  {
    monsterId: "lizardman_archer",
    characterId: "58a86692-b0dd-4e83-a93d-e7ad6943a75b",
    anims: [
      {
        key: "idle",
        perDir: {
          south: { animationId: "5adbcf2b-2cc7-47fb-98e2-7b52dbc920e5", frameCount: 4 },
          east:  { animationId: "d6e44231-3927-498e-87c2-a993b7ce83b4", frameCount: 4 },
          north: { animationId: "b31bd7da-2ddc-4e18-9ead-02e44b0e69c8", frameCount: 4 },
          west:  { animationId: "001dee78-e22f-4d2f-b809-15e7a91ff6ac", frameCount: 4 },
        },
      },
      {
        key: "attack",
        // bow_shoot v3 — east-only (player is on the right, archer
        // always faces east in combat). 7 frames (1 reference + 6
        // animated; we ship the full 7-frame sequence).
        perDir: {
          east:  { animationId: "18e8532b-1638-4c7f-a93b-1e9a764de6cc", frameCount: 7 },
        },
      },
    ],
  },
];

async function dl(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

(async () => {
  for (const spec of CHARS) {
    console.log(`\n=== ${spec.monsterId} ===`);

    // Load existing atlas so we merge instead of clobber walk frames.
    const { data: row, error: rErr } = await sb
      .from("monsters")
      .select("animation_atlas")
      .eq("id", spec.monsterId)
      .single();
    if (rErr) throw rErr;
    const atlas: Record<string, Record<string, string[]>> =
      (row.animation_atlas as Record<string, Record<string, string[]>> | null) ?? {};

    for (const anim of spec.anims) {
      console.log(`  [${anim.key}]`);
      const dirMap: Record<string, string[]> = { ...(atlas[anim.key] ?? {}) };
      for (const [dir, ref] of Object.entries(anim.perDir)) {
        if (!ref || ref.animationId === "FILL_ME") continue;
        const frames: string[] = [];
        for (let i = 0; i < ref.frameCount; i++) {
          const url = `${CHAR_BUCKET}/${spec.characterId}/animations/${ref.animationId}/${dir}/${i}.png`;
          const buf = await dl(url);
          const reg = await registerAsset(sb, {
            data: buf,
            contentType: "image/png",
            entityType: "monster",
            entityId: spec.monsterId,
            field: `${anim.key}_${dir}_${i}`,
            prompt: `${spec.monsterId} ${anim.key} ${dir} frame ${i}`,
            endpoint: "mcp_animate_character",
            generationSize: "68x68",
            generatedVia: "mcp",
            metadata: { pixellab_character_id: spec.characterId, animation_id: ref.animationId, direction: dir, frame_index: i },
          });
          frames.push(reg.url);
          process.stdout.write(reg.alreadyExisted ? "·" : "+");
        }
        process.stdout.write(` ${dir}\n`);
        dirMap[dir] = frames;
      }
      atlas[anim.key] = dirMap;
    }

    const { error: upErr } = await sb
      .from("monsters")
      .update({ animation_atlas: atlas })
      .eq("id", spec.monsterId);
    if (upErr) throw upErr;
    console.log(`  ✓ atlas merged (keys: ${Object.keys(atlas).join(", ")})`);
  }

  // Also re-sync the prop's mob_assets so the cutscene preloader sees
  // the new animations on next room load.
  const { data: monsterRows, error: mErr } = await sb
    .from("monsters")
    .select("id, sprite_atlas, animation_atlas")
    .in("id", ["centaur_warrior", "lizardman_archer"]);
  if (mErr) throw mErr;
  const mobAssets = monsterRows!.map((m) => ({
    id: m.id as string,
    sprite_atlas: m.sprite_atlas,
    animation_atlas: m.animation_atlas,
  }));
  const { data: propRow, error: pErr } = await sb
    .from("props")
    .select("metadata")
    .eq("id", "encounter_trigger_centaur_archer")
    .single();
  if (pErr) throw pErr;
  const meta = { ...(propRow.metadata as Record<string, unknown>), mob_assets: mobAssets };
  const { error: pUpErr } = await sb
    .from("props")
    .update({ metadata: meta })
    .eq("id", "encounter_trigger_centaur_archer");
  if (pUpErr) throw pUpErr;
  console.log("\n✓ encounter prop mob_assets re-synced");
})().catch((err) => { console.error(err); process.exit(1); });
