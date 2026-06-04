/**
 * Phase 4d-v4 — merge the new warrior anims into the existing
 * classes.warrior.combat_animation_atlas without dropping the keys
 * already in place.
 *
 *   - idle      → REPLACED with combat_idle_clean (open eyes,
 *                 minimal motion; the prior idle closed the eyes)
 *   - weakened  → NEW key for low-HP resting state
 *   - skill     → NEW key for spell-cast / potion-use animation
 *   - block     → NEW key for the defensive guard pose (held)
 *
 * Fill animationIds after the poll fires.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const PROJECT_ID = "8d5dc016-f9f1-4d60-b597-face41b54459";
const CHAR_BUCKET = `https://backblaze.pixellab.ai/file/pixellab-characters/${PROJECT_ID}`;
const CHAR_ID = "6d8cb2f1-d043-4845-8d7c-03565ba973d3";
const FACING = "south-west";

const ANIMS: Array<{ key: string; animationId: string; frameCount: number }> = [
  // combat_idle_clean — confirmed ID, replaces the prior idle.
  { key: "idle",     animationId: "05a71b69-65d3-4f4a-be28-8855f216b8af", frameCount: 9 },
  { key: "weakened", animationId: "dcd4bb33-7492-4cb6-af14-9d3837bd02e1", frameCount: 9 },
  { key: "skill",    animationId: "7fdc9c72-1f0e-4531-aee0-d6aabc194b19", frameCount: 9 },
  { key: "block",    animationId: "3cb2e099-14f1-4e43-a1ed-b9f0b4106232", frameCount: 7 },
];

async function dl(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

(async () => {
  console.log("=== classes/warrior v4 anim merge (south-west) ===");
  const { data: row, error: rErr } = await sb
    .from("classes")
    .select("combat_animation_atlas")
    .eq("id", "warrior")
    .single();
  if (rErr) throw rErr;
  const atlas: Record<string, Record<string, string[]>> =
    (row.combat_animation_atlas as Record<string, Record<string, string[]>> | null) ?? {};

  for (const anim of ANIMS) {
    if (anim.animationId.startsWith("FILL_")) {
      console.log(`  [${anim.key}] SKIP — id not filled`);
      continue;
    }
    const frames: string[] = [];
    for (let i = 0; i < anim.frameCount; i++) {
      const url = `${CHAR_BUCKET}/${CHAR_ID}/animations/${anim.animationId}/${FACING}/${i}.png`;
      const buf = await dl(url);
      const reg = await registerAsset(sb, {
        data: buf,
        contentType: "image/png",
        entityType: "class",
        entityId: "warrior",
        field: `combat_v4_${anim.key}_${FACING}_${i}`,
        prompt: `warrior v4 combat ${anim.key} ${FACING} frame ${i}`,
        endpoint: "mcp_animate_character",
        generationSize: "auto",
        generatedVia: "mcp",
        metadata: { pixellab_character_id: CHAR_ID, animation_id: anim.animationId, direction: FACING, frame_index: i, version: 4 },
      });
      frames.push(reg.url);
      process.stdout.write(reg.alreadyExisted ? "·" : "+");
    }
    process.stdout.write(` ${anim.key} (${anim.frameCount}f)\n`);
    atlas[anim.key] = { ...(atlas[anim.key] ?? {}), [FACING]: frames };
  }

  const { error: upErr } = await sb
    .from("classes")
    .update({ combat_animation_atlas: atlas })
    .eq("id", "warrior");
  if (upErr) throw upErr;
  console.log("✓ classes.warrior atlas merged keys:", Object.keys(atlas).join(", "));
})().catch((err) => { console.error(err); process.exit(1); });
