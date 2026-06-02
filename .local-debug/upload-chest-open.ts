/**
 * Add the OPEN-state sprite to the existing treasure_chest_copper
 * prop so the scene can swap textures once the player opens it.
 *
 * Source: PixelLab object a3082dd5 (frame 2 of review batch
 * 684c34c4) — same camera angle as the closed sprite, lid hinged
 * back at ~110°, copper body + verdigris highlights, dark cyan
 * interior glow.
 *
 * The closed sprite + interact metadata are untouched; we merge
 * `opened_sprite_url` into the existing metadata. The scene reads
 * this URL alongside player.opened_props to render the open variant.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const OPEN_CHEST_URL =
  "https://backblaze.pixellab.ai/file/pixellab-characters/objects/8d5dc016-f9f1-4d60-b597-face41b54459/a3082dd5-9fd6-4467-80a4-1a8e15215809/rotations/unknown.png";

(async () => {
  // 1) Upload + register the open sprite.
  const res = await fetch(OPEN_CHEST_URL);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const reg = await registerAsset(sb, {
    data: buf,
    contentType: "image/png",
    entityType: "prop",
    entityId: "treasure_chest_copper",
    field: "sprite_opened",
    prompt: "Open copper chest with verdigris highlights, lid hinged back, cyan interior; PixelLab object a3082dd5 frame 2.",
    endpoint: "pixellab_mcp",
    generationSize: "64x64",
    generatedVia: "mcp",
    metadata: { pixellab_object_id: "a3082dd5-9fd6-4467-80a4-1a8e15215809", source_batch: "684c34c4-af71-41d4-a4b8-2c2ed6d23349", frame: 2, state: "opened" },
  });
  console.log(reg.alreadyExisted ? "cache hit" : "uploaded", reg.url);

  // 2) Merge opened_sprite_url into the existing metadata. Read first
  // so we don't clobber interact / display props.
  const { data: cur, error: selErr } = await sb
    .from("props")
    .select("metadata")
    .eq("id", "treasure_chest_copper")
    .single();
  if (selErr) throw selErr;
  const merged = { ...(cur.metadata as Record<string, unknown> ?? {}), opened_sprite_url: reg.url };
  const { error: upErr } = await sb
    .from("props")
    .update({ metadata: merged })
    .eq("id", "treasure_chest_copper");
  if (upErr) throw upErr;
  console.log("✓ props.treasure_chest_copper.metadata.opened_sprite_url set");
})().catch((err) => { console.error(err); process.exit(1); });
