/**
 * Register the copper treasure chest (PixelLab object 9623c8b8...
 * selected from review batch 65194d06...) as a prop:
 *   - upload PNG → R2
 *   - insert/update props row id 'treasure_chest_copper' with
 *     collision=true, display_scale=1.0, and metadata.interact set so
 *     the /interact endpoint grants 2 minor_health_potion on every
 *     open (no state stored — user explicitly asked for it to repeat).
 *
 * Run once to bootstrap, then reseed (the room placement is in
 * data/seeds/phase3_tutorial.ts).
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const CHEST_URL =
  "https://backblaze.pixellab.ai/file/pixellab-characters/objects/8d5dc016-f9f1-4d60-b597-face41b54459/9623c8b8-b80d-4d0d-98fa-b3e20be03d66/rotations/unknown.png";

(async () => {
  const res = await fetch(CHEST_URL);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const reg = await registerAsset(sb, {
    data: buf,
    contentType: "image/png",
    entityType: "prop",
    entityId: "treasure_chest_copper",
    field: "sprite",
    prompt: "Copper treasure chest with verdigris highlights; PixelLab object 9623c8b8 frame 0.",
    endpoint: "pixellab_mcp",
    generationSize: "64x64",
    generatedVia: "mcp",
    metadata: { pixellab_object_id: "9623c8b8-b80d-4d0d-98fa-b3e20be03d66", source_batch: "65194d06-af88-4a7f-9132-d519f013c191", frame: 0 },
  });
  console.log(reg.alreadyExisted ? "cache hit" : "uploaded", reg.url);

  // Upsert the prop definition. interact.kind='loot' tells the
  // /interact route this prop yields items every time it's opened;
  // the items list + message_key drive the grant + toast on the client.
  const { error } = await sb.from("props").upsert(
    {
      id: "treasure_chest_copper",
      sprite_url: reg.url,
      collision: true,
      display_scale: 1.0,
      metadata: {
        interact: {
          kind: "loot",
          items: [{ item_id: "minor_health_potion", quantity: 2 }],
          message_key: "interact.chest_potions_x2",
        },
      },
    },
    { onConflict: "id" },
  );
  if (error) throw error;
  console.log("✓ props.treasure_chest_copper upserted with interact metadata");
})().catch((err) => { console.error(err); process.exit(1); });
