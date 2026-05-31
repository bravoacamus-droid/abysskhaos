/**
 * Pull the user's curated UI icons from PixelLab into our R2.
 *
 * Tag strategy (the user tagged the FINAL chosen variant of each icon
 * with its Spanish name in PixelLab):
 *   fuerza      → STR    agilidad → AGI    inteligencia → INT
 *   espiritu    → SPI    salud    → HP     mana         → MP
 *   defensa     → DEF    pocion   → cat_consumable
 *
 * ATK, KHRYN, cat_armor, cat_accessory don't have a Spanish-name tag
 * yet, so we fall back to the user's earlier `icon-final` batch for
 * those. cat_weapon reuses ATK (no dedicated weapon-category icon).
 *
 * To swap or add an icon: re-tag the chosen PixelLab object with the
 * Spanish name (or icon-final), update this map, rerun the script.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const PROJECT_ID = "8d5dc016-f9f1-4d60-b597-face41b54459";

function rotationUrl(objectId: string): string {
  return `https://backblaze.pixellab.ai/file/pixellab-characters/objects/${PROJECT_ID}/${objectId}/rotations/unknown.png`;
}

/** Map: which icon-constant ← which PixelLab object id ← which user tag. */
const ICONS: Array<{ key: string; objectId: string; tag: string }> = [
  // Spanish-tagged finalised icons.
  { key: "str",            objectId: "82625831-ca70-4dd6-8f50-5a1201f40394", tag: "fuerza" },
  { key: "agi",            objectId: "22d0f959-dd5c-40f7-9b7a-9d09b080b6b3", tag: "agilidad" },
  { key: "int",            objectId: "30d2f467-44e4-476f-9332-f59bc6060415", tag: "inteligencia" },
  { key: "spi",            objectId: "e2ac88ca-f7e7-4d2d-9463-c7410adf8b57", tag: "espiritu" },
  { key: "hp",             objectId: "c83b89a0-21ec-4762-81b2-33c1bb618e93", tag: "salud" },
  { key: "mp",             objectId: "adf703be-ff78-49e2-a691-33192292b56c", tag: "mana" },
  { key: "def",            objectId: "a067d887-1c72-4a80-9b2a-a92bcb26b6f6", tag: "defensa" },
  { key: "cat_consumable", objectId: "292e1373-ff98-40e9-9369-eb8cf72c6603", tag: "pocion" },
  // No Spanish tag yet — fall back to icon-final batch.
  { key: "atk",            objectId: "74f817c2-3da6-4f00-91dc-d69747b1e244", tag: "icon-final" },
  { key: "khryn",          objectId: "6ea6bdab-f20c-416f-bc2e-2c90b86d27f4", tag: "icon-final" },
  { key: "cat_armor",      objectId: "79c1daa6-55e4-4f39-a50f-6a9858fc442a", tag: "icon-final" },
  { key: "cat_accessory",  objectId: "7f1552ad-bba6-42f3-96f1-451401844d69", tag: "icon-final" },
];

(async () => {
  const out: Record<string, string> = {};
  for (const icon of ICONS) {
    const res = await fetch(rotationUrl(icon.objectId));
    if (!res.ok) {
      console.error(`${icon.key} FAILED ${res.status} ${res.statusText}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const reg = await registerAsset(sb, {
      data: buf,
      contentType: "image/png",
      entityType: "ui",
      entityId: `icon_${icon.key}_v2`,
      field: "sprite",
      prompt: `Pulled from PixelLab object ${icon.objectId} (tag: ${icon.tag})`,
      endpoint: "pixellab_mcp",
      generationSize: "32x32",
      generatedVia: "mcp",
      metadata: { pixellab_object_id: icon.objectId, tag: icon.tag },
    });
    out[icon.key] = reg.url;
    console.log(`${icon.key.padEnd(15)} [${icon.tag.padEnd(13)}] ${reg.alreadyExisted ? "(cache hit) " : "(uploaded)  "} ${reg.url}`);
  }
  console.log("\n=== lib/client/icons.ts constants (paste in) ===");
  for (const [k, u] of Object.entries(out)) {
    const constName = k.toUpperCase() + "_ICON_URL";
    console.log(`export const ${constName} =\n  "${u}";`);
  }
})().catch((err) => { console.error(err); process.exit(1); });
