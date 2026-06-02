/**
 * Replace the dull starter_iron_sword sprite with the vibrant v2
 * (PixelLab object 34ad36b4-2e95-4c20-b0e4-662ee1312562 — frame 1
 * selected from review batch 1d6757b…; cyan rune-glow + oxblood
 * leather grip + polished steel blade).
 *
 * Used as BOTH the inventory icon (items_master.icon_path) and the
 * ground sprite when the sword drops in r01 during the Cedric
 * tutorial — same URL, single source of truth.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const SWORD_URL =
  "https://backblaze.pixellab.ai/file/pixellab-characters/objects/8d5dc016-f9f1-4d60-b597-face41b54459/34ad36b4-2e95-4c20-b0e4-662ee1312562/rotations/unknown.png";

(async () => {
  const res = await fetch(SWORD_URL);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const reg = await registerAsset(sb, {
    data: buf,
    contentType: "image/png",
    entityType: "item",
    entityId: "starter_iron_sword",
    field: "icon",
    prompt: "Vibrant heroic starter iron longsword, polished steel + cyan rune glow + oxblood grip; PixelLab object 34ad36b4 frame 1.",
    endpoint: "pixellab_mcp",
    generationSize: "64x64",
    generatedVia: "mcp",
    metadata: { pixellab_object_id: "34ad36b4-2e95-4c20-b0e4-662ee1312562", source_batch: "1d6757bf-f4fc-4146-87fb-78d274441ddd", frame: 1 },
  });
  console.log(reg.alreadyExisted ? "cache hit" : "uploaded", reg.url);

  const { error } = await sb
    .from("items_master")
    .update({ icon_path: reg.url })
    .eq("id", "starter_iron_sword");
  if (error) throw error;
  console.log("✓ items_master.starter_iron_sword.icon_path =", reg.url);
})().catch((err) => { console.error(err); process.exit(1); });
