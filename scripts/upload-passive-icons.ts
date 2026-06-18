/**
 * Passive (Don) icon pipeline. The 12 runic-emblem icons were generated in
 * PixelLab as 1-direction objects and finalized to a single frame. This
 * downloads each object's frame, uploads it to R2 (content-hashed via
 * registerAsset), and sets `passives.icon_url`.
 *
 * The reveal's PassiveSigil swaps its placeholder ✦ for icon_url automatically.
 *
 * Run:  pnpm tsx scripts/upload-passive-icons.ts
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const PROJECT_ID = "8d5dc016-f9f1-4d60-b597-face41b54459";
const OBJ_BASE = `https://backblaze.pixellab.ai/file/pixellab-characters/objects/${PROJECT_ID}`;

/** passiveId -> finalized PixelLab object id (runic emblem, color by effect). */
const PASSIVE_ICONS: Record<string, string> = {
  golpe_certero: "b02d8863-5203-4ddb-a2a9-801e20e260fe", // crossed daggers (crimson)
  coraza_espiritual: "feb39e00-e723-4501-af30-f883b8b75897", // spirit shield (blue)
  reflejo_renacido: "076775c1-68f5-4a28-841e-76e36956a080", // agile dodging figure (teal)
  lazo_almas: "dc732803-bbaa-4d7f-8ef5-bf9e0d6e8f19", // two soul-flames bond (violet)
  fortuna_renacido: "93fcbda0-c267-4464-a92a-e83300b984b3", // gold coins
  codicia_destino: "3a8b8674-c1c1-488b-a08b-381b600bb175", // gem (purple/red)
  forjador_innato: "ef1db5b8-0c9a-4d74-ba8c-8b798c48cbb8", // hammer + anvil sparks
  memoria_vidas: "3b5fbfd1-1486-461e-ad2e-48f564c74e71", // open book (cyan)
  nucleo_elemental: "4440fe51-c465-467e-86c5-7aaa893f3510", // radiant star core (gold-white)
  hambre_vital: "7e5e94d8-04b7-41b5-82e6-d0bc222bf92d", // fanged heart (dark crimson)
  viajero_etereo: "4c0c26e7-b9dd-4934-98d8-264be0d4eaa7", // winged boot (jade)
  flujo_mana: "94bbd583-74df-4619-9f4a-f86d3d559a51", // mana droplet (azure)
};

async function dl(objectId: string): Promise<Buffer> {
  // Finalized 1-frame objects expose the frame as rotations/unknown.png.
  const candidates = [`${OBJ_BASE}/${objectId}/rotations/unknown.png`, `${OBJ_BASE}/${objectId}/rotations/frame_0.png`];
  let lastErr: unknown;
  for (const u of candidates) {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const r = await fetch(u);
        if (r.ok) return Buffer.from(await r.arrayBuffer());
        if (r.status === 404) break; // try next candidate path
        lastErr = new Error(`${u}: ${r.status}`);
      } catch (e) {
        lastErr = e;
      }
      await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
    }
  }
  throw lastErr ?? new Error(`could not download object ${objectId}`);
}

async function main() {
  for (const [passiveId, objectId] of Object.entries(PASSIVE_ICONS)) {
    const data = await dl(objectId);
    const reg = await registerAsset(supabase, {
      data,
      contentType: "image/png",
      entityType: "passive",
      entityId: passiveId,
      field: "icon",
      prompt: `${passiveId} runic emblem ability icon`,
      endpoint: "mcp_create_object",
      generationSize: "128x128",
      generatedVia: "mcp",
      metadata: { pixellab_object_id: objectId },
    });
    const { error } = await supabase.from("passives").update({ icon_url: reg.url }).eq("id", passiveId);
    if (error) throw new Error(`update passives.${passiveId}: ${error.message}`);
    console.log(`${reg.alreadyExisted ? "·" : "+"} ${passiveId.padEnd(18)} -> ${reg.url}`);
  }
  console.log("\n✓ 12 passive icons uploaded + passives.icon_url set");
}

main().catch((e) => { console.error(e); process.exit(1); });
