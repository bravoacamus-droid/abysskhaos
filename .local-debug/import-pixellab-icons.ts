/**
 * Pull the 12 finalized icons the user tagged 'icon-final' in PixelLab,
 * download each rotation PNG, and re-upload through our registerAsset
 * pipeline so they live in our R2 (content-hashed, durable, takedown-
 * able) rather than depending on backblaze URLs we don't own.
 *
 * After running: copy the printed const block into lib/client/icons.ts.
 *
 * Why we re-upload instead of using PixelLab URLs directly: the project
 * convention (data/ARCHITECTURE.md) is that every shipped asset is
 * registered in `asset_generations` with provenance for audit + has a
 * stable hash-named R2 URL we control.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** Map: which icon-constant ← which PixelLab object id. */
const ICONS: Array<{ key: string; objectId: string; rotationUrl: string }> = [
  { key: "hp",             objectId: "54de0916-a607-4f7c-b922-e2ecc95b4951", rotationUrl: "https://backblaze.pixellab.ai/file/pixellab-characters/objects/8d5dc016-f9f1-4d60-b597-face41b54459/54de0916-a607-4f7c-b922-e2ecc95b4951/rotations/unknown.png" },
  { key: "mp",             objectId: "182ead13-258c-4f54-b4eb-798225fe9348", rotationUrl: "https://backblaze.pixellab.ai/file/pixellab-characters/objects/8d5dc016-f9f1-4d60-b597-face41b54459/182ead13-258c-4f54-b4eb-798225fe9348/rotations/unknown.png" },
  { key: "atk",            objectId: "74f817c2-3da6-4f00-91dc-d69747b1e244", rotationUrl: "https://backblaze.pixellab.ai/file/pixellab-characters/objects/8d5dc016-f9f1-4d60-b597-face41b54459/74f817c2-3da6-4f00-91dc-d69747b1e244/rotations/unknown.png" },
  { key: "def",            objectId: "882fce2b-2770-42aa-b102-1c8d72eab09f", rotationUrl: "https://backblaze.pixellab.ai/file/pixellab-characters/objects/8d5dc016-f9f1-4d60-b597-face41b54459/882fce2b-2770-42aa-b102-1c8d72eab09f/rotations/unknown.png" },
  { key: "str",            objectId: "be18c133-1595-4be7-824a-c0d1c5b31b2b", rotationUrl: "https://backblaze.pixellab.ai/file/pixellab-characters/objects/8d5dc016-f9f1-4d60-b597-face41b54459/be18c133-1595-4be7-824a-c0d1c5b31b2b/rotations/unknown.png" },
  { key: "agi",            objectId: "67869bdf-57c8-4ba1-bb3d-babfe02d3fd3", rotationUrl: "https://backblaze.pixellab.ai/file/pixellab-characters/objects/8d5dc016-f9f1-4d60-b597-face41b54459/67869bdf-57c8-4ba1-bb3d-babfe02d3fd3/rotations/unknown.png" },
  { key: "int",            objectId: "5074be92-c85b-47ed-b697-c7f072512496", rotationUrl: "https://backblaze.pixellab.ai/file/pixellab-characters/objects/8d5dc016-f9f1-4d60-b597-face41b54459/5074be92-c85b-47ed-b697-c7f072512496/rotations/unknown.png" },
  { key: "spi",            objectId: "2b6d265a-da33-4bc8-a539-6ef94e2694bc", rotationUrl: "https://backblaze.pixellab.ai/file/pixellab-characters/objects/8d5dc016-f9f1-4d60-b597-face41b54459/2b6d265a-da33-4bc8-a539-6ef94e2694bc/rotations/unknown.png" },
  { key: "khryn",          objectId: "6ea6bdab-f20c-416f-bc2e-2c90b86d27f4", rotationUrl: "https://backblaze.pixellab.ai/file/pixellab-characters/objects/8d5dc016-f9f1-4d60-b597-face41b54459/6ea6bdab-f20c-416f-bc2e-2c90b86d27f4/rotations/unknown.png" },
  { key: "cat_armor",      objectId: "79c1daa6-55e4-4f39-a50f-6a9858fc442a", rotationUrl: "https://backblaze.pixellab.ai/file/pixellab-characters/objects/8d5dc016-f9f1-4d60-b597-face41b54459/79c1daa6-55e4-4f39-a50f-6a9858fc442a/rotations/unknown.png" },
  { key: "cat_accessory",  objectId: "7f1552ad-bba6-42f3-96f1-451401844d69", rotationUrl: "https://backblaze.pixellab.ai/file/pixellab-characters/objects/8d5dc016-f9f1-4d60-b597-face41b54459/7f1552ad-bba6-42f3-96f1-451401844d69/rotations/unknown.png" },
  { key: "cat_consumable", objectId: "36010553-1234-4ea1-92c3-ee2298b19e2b", rotationUrl: "https://backblaze.pixellab.ai/file/pixellab-characters/objects/8d5dc016-f9f1-4d60-b597-face41b54459/36010553-1234-4ea1-92c3-ee2298b19e2b/rotations/unknown.png" },
];

(async () => {
  const out: Record<string, string> = {};
  for (const icon of ICONS) {
    const res = await fetch(icon.rotationUrl);
    if (!res.ok) {
      console.error(`${icon.key} FAILED ${res.status} ${res.statusText}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const reg = await registerAsset(sb, {
      data: buf,
      contentType: "image/png",
      entityType: "ui",
      entityId: `icon_${icon.key}_color`,
      field: "sprite",
      prompt: `Pulled from PixelLab object ${icon.objectId} (tag: icon-final)`,
      endpoint: "pixellab_mcp",
      generationSize: "32x32",
      generatedVia: "mcp",
      metadata: { pixellab_object_id: icon.objectId, tag: "icon-final" },
    });
    out[icon.key] = reg.url;
    console.log(`${icon.key.padEnd(15)} ${reg.alreadyExisted ? "(cache hit) " : "(uploaded)  "} ${reg.url}`);
  }
  console.log("\n=== lib/client/icons.ts constants (paste in) ===");
  for (const [k, u] of Object.entries(out)) {
    const constName = k.toUpperCase() + "_ICON_URL";
    console.log(`export const ${constName} =\n  "${u}";`);
  }
})().catch((err) => { console.error(err); process.exit(1); });
