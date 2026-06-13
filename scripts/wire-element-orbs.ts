/**
 * Wire the 9 elemental affinity orbs into the game.
 *
 * For each element, downloads the PixelLab "south" frame of its orb character,
 * uploads it to R2 (content-hashed, idempotent), registers the generation in
 * asset_generations, and sets elements.orb_url.
 *
 * The orb character ids are the ones curated in the PixelLab gallery (a glass
 * sphere with the living element inside, no base, no body). Re-running is a
 * no-op on unchanged bytes.
 *
 * Usage:  pnpm tsx scripts/wire-element-orbs.ts
 */

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });

const PIXELLAB_PROJECT = "8d5dc016-f9f1-4d60-b597-face41b54459";

/** element id (elements.id) → PixelLab orb character id. */
const ORB_BY_ELEMENT: Record<string, string> = {
  fire: "9675a220-465d-4755-b00c-383d1bec42b1",
  water: "67244d8c-b1cd-4ff3-8b81-f2e196111fe2",
  wood: "0499b6ec-4979-4b99-bdf1-9f5afff6142a",
  earth: "a7997b0a-497f-48ac-962a-038935d811e6",
  metal: "1ed15acc-231a-449f-abf3-d17d65a96ff6",
  wind: "2721b306-6a76-4f89-b14d-2f5f18f960b6",
  lightning: "472f4991-8271-4315-a561-411be083e325",
  light: "7e5e71f4-75cd-4606-b601-468500d8c3dd",
  shadow: "161d9064-0379-4640-ac36-283666461f3a",
};

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

function southUrl(orbId: string): string {
  return `https://backblaze.pixellab.ai/file/pixellab-characters/${PIXELLAB_PROJECT}/${orbId}/rotations/south.png`;
}

async function main() {
  for (const [element, orbId] of Object.entries(ORB_BY_ELEMENT)) {
    const src = southUrl(orbId);
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch ${element} orb (${res.status}): ${src}`);
    const bytes = Buffer.from(await res.arrayBuffer());

    const registered = await registerAsset(supabase, {
      data: bytes,
      contentType: "image/png",
      entityType: "element",
      entityId: element,
      field: "orb",
      prompt: `elemental affinity orb — ${element}`,
      endpoint: "create_character",
      generationSize: "96x96",
      generatedVia: "mcp",
      metadata: { pixellab_character_id: orbId, frame: "south" },
    });

    const { error } = await supabase.from("elements").update({ orb_url: registered.url }).eq("id", element);
    if (error) throw new Error(`update ${element}.orb_url: ${error.message}`);

    console.log(`${element.padEnd(10)} ${registered.alreadyExisted ? "cached " : "uploaded"} ${registered.url}`);
  }
  console.log("\nDone. 9 element orbs wired.");
}

main().catch((err) => {
  console.error("\nwire-element-orbs failed:", err);
  process.exit(1);
});
