/** Replace warrior combat_animation_atlas.death with the new
 *  combat_death_kneel anim (kneeling on sword, not falling back). */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const PROJECT_ID = "8d5dc016-f9f1-4d60-b597-face41b54459";
const CHAR_BUCKET = `https://backblaze.pixellab.ai/file/pixellab-characters/${PROJECT_ID}`;
const CHAR_ID = "6d8cb2f1-d043-4845-8d7c-03565ba973d3";
const ANIM_ID = "c2a55663-aa28-4294-a90b-bde9ae2e747c";
const FACING = "south-west";
const FRAME_COUNT = 9;

async function dl(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

(async () => {
  const { data: row, error: rErr } = await sb
    .from("classes")
    .select("combat_animation_atlas")
    .eq("id", "warrior")
    .single();
  if (rErr) throw rErr;
  const atlas: Record<string, Record<string, string[]>> =
    (row.combat_animation_atlas as Record<string, Record<string, string[]>> | null) ?? {};

  const frames: string[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const url = `${CHAR_BUCKET}/${CHAR_ID}/animations/${ANIM_ID}/${FACING}/${i}.png`;
    const buf = await dl(url);
    const reg = await registerAsset(sb, {
      data: buf,
      contentType: "image/png",
      entityType: "class",
      entityId: "warrior",
      field: `combat_v4_death_kneel_${FACING}_${i}`,
      prompt: `warrior v4 combat death kneel ${FACING} frame ${i}`,
      endpoint: "mcp_animate_character",
      generationSize: "auto",
      generatedVia: "mcp",
      metadata: { pixellab_character_id: CHAR_ID, animation_id: ANIM_ID, direction: FACING, frame_index: i, version: 4 },
    });
    frames.push(reg.url);
    process.stdout.write(reg.alreadyExisted ? "·" : "+");
  }
  process.stdout.write(` death (${FRAME_COUNT}f)\n`);

  atlas.death = { ...(atlas.death ?? {}), [FACING]: frames };
  const { error: upErr } = await sb
    .from("classes")
    .update({ combat_animation_atlas: atlas })
    .eq("id", "warrior");
  if (upErr) throw upErr;
  console.log("✓ warrior death key REPLACED with kneeling-on-sword anim");
})().catch((err) => { console.error(err); process.exit(1); });
