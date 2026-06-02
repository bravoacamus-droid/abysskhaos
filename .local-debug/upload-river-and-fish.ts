/**
 * River animation (loops) + fish jump (one-shot on bridge step).
 *
 * river:  base prop already exists (cave_river); add 9 animation
 *         frames so it flows continuously under the bridge.
 *
 * fish:   new prop `river_fish_jump`, static sprite (PixelLab object
 *         a4fc30e1 / batch 23a6d413 frame 11). No animation frames
 *         — the scene's one-shot fallback runs a leap tween (rise +
 *         peak + fall + fade). metadata.one_shot_on_step = (6, 5)
 *         hides it by default and plays it once when the player
 *         steps onto the bridge tile in r02.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const RIVER_BASE_ID = "27e10caa-3aeb-4dcc-813b-18b48df4584d";
const RIVER_ANIM_GROUP = "b1e53164-425f-4657-9a11-f1c141dae2f9";
const RIVER_FRAME_COUNT = 9;
const RIVER_FRAMERATE = 5;

const FISH_OBJECT_ID = "a4fc30e1-3a2c-4941-bc74-e858e2c22801";
const BUCKET = "https://backblaze.pixellab.ai/file/pixellab-characters/objects/8d5dc016-f9f1-4d60-b597-face41b54459";

async function downloadPng(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

(async () => {
  // 1) River animation frames.
  console.log("=== cave_river animation frames ===");
  const riverFrameUrls: string[] = [];
  for (let i = 0; i < RIVER_FRAME_COUNT; i++) {
    const url = `${BUCKET}/${RIVER_BASE_ID}/animations/${RIVER_ANIM_GROUP}/unknown/${i}.png`;
    const buf = await downloadPng(url);
    const reg = await registerAsset(sb, {
      data: buf,
      contentType: "image/png",
      entityType: "prop",
      entityId: "cave_river",
      field: `anim_frame_${i}`,
      prompt: `cave_river flow animation frame ${i}`,
      endpoint: "mcp_animate_object",
      generationSize: "128x128",
      generatedVia: "mcp",
      metadata: { animation_group: RIVER_ANIM_GROUP, frame_index: i },
    });
    riverFrameUrls.push(reg.url);
    process.stdout.write(reg.alreadyExisted ? "·" : "+");
  }
  process.stdout.write("\n");

  // Update cave_river prop to carry the animation. Frame 0 stays as
  // the static fallback if Phaser ever fails to load the animation.
  const { error: rErr } = await sb.from("props").upsert(
    {
      id: "cave_river",
      sprite_url: riverFrameUrls[0],
      collision: false,
      display_scale: 1.0,
      metadata: {
        label: "Cave River (animated)",
        canvas: "128x128",
        mcp_object_id: RIVER_BASE_ID,
        animation_frames: riverFrameUrls,
        animation_framerate: RIVER_FRAMERATE,
      },
    },
    { onConflict: "id" },
  );
  if (rErr) throw rErr;
  console.log(`✓ props.cave_river updated with ${RIVER_FRAME_COUNT} flow frames @ ${RIVER_FRAMERATE}fps`);

  // 2) Fish jump sprite (single static; scene tweens the leap).
  console.log("\n=== river_fish_jump sprite ===");
  const fishUrl = `${BUCKET}/${FISH_OBJECT_ID}/rotations/unknown.png`;
  const fishBuf = await downloadPng(fishUrl);
  const fishReg = await registerAsset(sb, {
    data: fishBuf,
    contentType: "image/png",
    entityType: "prop",
    entityId: "river_fish_jump",
    field: "sprite",
    prompt: "Silver fish leaping out of river with cyan splash ring; PixelLab object a4fc30e1 from batch 23a6d413 frame 11.",
    endpoint: "pixellab_mcp",
    generationSize: "64x64",
    generatedVia: "mcp",
    metadata: { pixellab_object_id: FISH_OBJECT_ID, source_batch: "23a6d413-dafa-42b0-83f9-5f99846df666", frame: 11 },
  });
  console.log(fishReg.alreadyExisted ? "cache hit" : "uploaded", fishReg.url);

  const { error: fErr } = await sb.from("props").upsert(
    {
      id: "river_fish_jump",
      sprite_url: fishReg.url,
      collision: false,
      // Slightly smaller than a full tile so the leap reads as ambient
      // detail, not a focal object.
      display_scale: 0.8,
      metadata: {
        label: "River Fish (one-shot leap on bridge step)",
        canvas: "64x64",
        // The scene's renderer keeps this hidden until the player
        // steps onto (6, 5) — the bridge tile in r02 — then runs the
        // leap tween once. Resets when the player leaves and re-enters
        // the room.
        one_shot_on_step: { x: 6, y: 5 },
      },
    },
    { onConflict: "id" },
  );
  if (fErr) throw fErr;
  console.log("✓ props.river_fish_jump upserted (one_shot_on_step at 6, 5)");
})().catch((err) => { console.error(err); process.exit(1); });
