/** Phase 4d weapon-family pack — merges the 25 new warrior anims
 *  into classes.warrior.combat_animation_atlas keyed by
 *  <state>_<family> (5 families x 5 states each).
 *
 *  Generic keys (idle, attack, skill, block, death) stay as the
 *  sword_1h baseline so existing players keep working; the family
 *  suffix variants only fire when a different weapon is equipped.
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

type AnimEntry = { atlasKey: string; animationId: string; frameCount: number };

const ANIMS: AnimEntry[] = [
  // sword_2h
  { atlasKey: "idle_sword_2h",        animationId: "79d4041a-7e23-4bff-87ad-f66d83a56cb6", frameCount: 9 },
  { atlasKey: "attack_sword_2h",      animationId: "257170c6-dd24-4f8e-badf-55b62965c4e7", frameCount: 11 },
  { atlasKey: "skill_sword_2h",       animationId: "b38ca92b-34f1-44a7-82b6-0353a7d1338a", frameCount: 9 },
  { atlasKey: "block_sword_2h",       animationId: "8f95c7ca-a4bf-4500-81cd-15885505af85", frameCount: 7 },
  { atlasKey: "death_sword_2h",       animationId: "21b5565c-fd9a-432a-8d2f-5cc6e73e739e", frameCount: 9 },
  // sword_1h_shield
  { atlasKey: "idle_sword_1h_shield", animationId: "ce38bd99-3434-49da-8e9d-419b847b0a74", frameCount: 9 },
  { atlasKey: "attack_sword_1h_shield", animationId: "32bdcf53-6699-4864-ae7c-e34309db5da4", frameCount: 11 },
  { atlasKey: "skill_sword_1h_shield",  animationId: "e74b569c-a7d5-4055-97ed-2453b3639dbd", frameCount: 9 },
  { atlasKey: "block_sword_1h_shield",  animationId: "fc6de249-baf8-444b-bb48-d42879220e3a", frameCount: 7 },
  { atlasKey: "death_sword_1h_shield",  animationId: "66bdd057-9801-4c28-9fa0-635ab10187b6", frameCount: 9 },
  // axe_1h
  { atlasKey: "idle_axe_1h",   animationId: "2493a091-373b-44f7-996e-d4bf96c9e5ef", frameCount: 9 },
  { atlasKey: "attack_axe_1h", animationId: "39d011f6-1671-4775-9372-216a8aee67cf", frameCount: 11 },
  { atlasKey: "skill_axe_1h",  animationId: "6993fabd-e8b8-441b-8980-06f5c06b0691", frameCount: 9 },
  { atlasKey: "block_axe_1h",  animationId: "670a7b9b-2d9f-431b-89de-f47a2a05e9ed", frameCount: 7 },
  { atlasKey: "death_axe_1h",  animationId: "358b3477-5294-4351-a02b-7121140026d6", frameCount: 9 },
  // axe_1h_shield
  { atlasKey: "idle_axe_1h_shield",   animationId: "8e7e2bac-da51-496f-b7ca-bf968b7e60e2", frameCount: 9 },
  { atlasKey: "attack_axe_1h_shield", animationId: "d8adbfd8-3f9b-40c7-9f35-26ae85539e29", frameCount: 11 },
  { atlasKey: "skill_axe_1h_shield",  animationId: "e835d56a-5e0e-4bcd-af8b-4e7e6b105455", frameCount: 9 },
  { atlasKey: "block_axe_1h_shield",  animationId: "b985a2a9-3812-44f3-9bc0-25d04fdd0445", frameCount: 7 },
  { atlasKey: "death_axe_1h_shield",  animationId: "4eaf65c3-9780-4ad4-94c2-78bfb6f2d4ee", frameCount: 9 },
  // axe_2h
  { atlasKey: "idle_axe_2h",   animationId: "e35b3779-a1f9-451b-a364-dabaabb60af1", frameCount: 9 },
  { atlasKey: "attack_axe_2h", animationId: "d0eee85f-ee5a-47b6-8434-27438818ad13", frameCount: 11 },
  { atlasKey: "skill_axe_2h",  animationId: "c47acf0e-f0bf-4b49-a2e7-36566eaa0851", frameCount: 9 },
  { atlasKey: "block_axe_2h",  animationId: "8663fc86-7c33-462d-a169-067b693e3807", frameCount: 7 },
  { atlasKey: "death_axe_2h",  animationId: "45d33e82-74b4-4c15-83eb-72b68697806d", frameCount: 9 },
];

async function dl(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

(async () => {
  const { data: row, error: rErr } = await sb
    .from("classes").select("combat_animation_atlas").eq("id", "warrior").single();
  if (rErr) throw rErr;
  const atlas: Record<string, Record<string, string[]>> =
    (row.combat_animation_atlas as Record<string, Record<string, string[]>> | null) ?? {};

  for (const anim of ANIMS) {
    if (anim.animationId.startsWith("FILL_")) {
      console.log(`  [${anim.atlasKey}] SKIP — id not filled`);
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
        field: `combat_wf_${anim.atlasKey}_${FACING}_${i}`,
        prompt: `warrior combat ${anim.atlasKey} ${FACING} frame ${i}`,
        endpoint: "mcp_animate_character",
        generationSize: "auto",
        generatedVia: "mcp",
        metadata: { pixellab_character_id: CHAR_ID, animation_id: anim.animationId, atlas_key: anim.atlasKey, direction: FACING, frame_index: i },
      });
      frames.push(reg.url);
      process.stdout.write(reg.alreadyExisted ? "·" : "+");
    }
    process.stdout.write(` ${anim.atlasKey} (${anim.frameCount}f)\n`);
    atlas[anim.atlasKey] = { ...(atlas[anim.atlasKey] ?? {}), [FACING]: frames };
  }

  const { error: upErr } = await sb.from("classes").update({ combat_animation_atlas: atlas }).eq("id", "warrior");
  if (upErr) throw upErr;
  console.log("✓ warrior atlas merged with weapon-family keys");
  console.log("Keys now:", Object.keys(atlas).sort().join(", "));
})().catch((err) => { console.error(err); process.exit(1); });
