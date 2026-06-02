/**
 * Replace the river_fish_jump tween fallback with real PixelLab
 * animation frames.
 *
 * Source: animate_object on the fish object a4fc30e1, animation group
 * dc456563 — 8 frames of a leap: submerged → breach → arch peak →
 * dive back → splash closes. Loops cleanly so re-triggering during
 * a later visit looks identical to the first.
 *
 * Rerun whenever the source animation is re-rendered (idempotent).
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const FISH_BASE_ID = "a4fc30e1-3a2c-4941-bc74-e858e2c22801";
const FISH_ANIM_GROUP = "dc456563-1a27-4409-815e-bc79496961ed";
const FISH_FRAME_COUNT = 8;
const FISH_FRAMERATE = 10;
const BUCKET = "https://backblaze.pixellab.ai/file/pixellab-characters/objects/8d5dc016-f9f1-4d60-b597-face41b54459";

async function downloadPng(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

(async () => {
  console.log(`=== river_fish_jump animation (${FISH_FRAME_COUNT} frames) ===`);
  const frameUrls: string[] = [];
  for (let i = 0; i < FISH_FRAME_COUNT; i++) {
    const url = `${BUCKET}/${FISH_BASE_ID}/animations/${FISH_ANIM_GROUP}/unknown/${i}.png`;
    const buf = await downloadPng(url);
    const reg = await registerAsset(sb, {
      data: buf,
      contentType: "image/png",
      entityType: "prop",
      entityId: "river_fish_jump",
      field: `anim_frame_${i}`,
      prompt: `river_fish_jump leap animation frame ${i}`,
      endpoint: "mcp_animate_object",
      generationSize: "64x64",
      generatedVia: "mcp",
      metadata: { animation_group: FISH_ANIM_GROUP, frame_index: i },
    });
    frameUrls.push(reg.url);
    process.stdout.write(reg.alreadyExisted ? "·" : "+");
  }
  process.stdout.write("\n");

  // Frame 0 is the calm-surface state — perfect as the static fallback
  // sprite the scene shows when the player isn't on the trigger tile
  // (though it stays setVisible(false) anyway thanks to one_shot_on_step).
  const { error } = await sb.from("props").upsert(
    {
      id: "river_fish_jump",
      sprite_url: frameUrls[0],
      collision: false,
      display_scale: 0.9,
      metadata: {
        label: "River Fish (PixelLab leap animation, one-shot on bridge step)",
        canvas: "64x64",
        mcp_object_id: FISH_BASE_ID,
        animation_frames: frameUrls,
        animation_framerate: FISH_FRAMERATE,
        one_shot_on_step: { x: 6, y: 5 },
      },
    },
    { onConflict: "id" },
  );
  if (error) throw error;
  console.log(`✓ props.river_fish_jump now plays ${FISH_FRAME_COUNT} frames @ ${FISH_FRAMERATE}fps on bridge step`);
})().catch((err) => { console.error(err); process.exit(1); });
