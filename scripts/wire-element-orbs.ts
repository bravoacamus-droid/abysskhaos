/**
 * Wire the 9 elemental affinity orbs into the game.
 *
 * For each element, downloads from PixelLab and uploads to R2 (content-hashed,
 * idempotent), then sets the columns on `elements`:
 *   - orb_url   : the static "south" rotation frame (single-image fallback).
 *   - orb_atlas : the 9 frames of the `element-flicker` animation, in play
 *                 order, so the client can cycle them for the "living element
 *                 inside a still orb" look.
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

/**
 * element id (elements.id) → PixelLab orb character id + its `element-flicker`
 * animation group id (9 south frames). Both are stable once curated.
 */
const ORB_BY_ELEMENT: Record<string, { charId: string; animId: string }> = {
  fire: { charId: "9675a220-465d-4755-b00c-383d1bec42b1", animId: "1fdd1e2c-df13-4eb0-b582-4408070a6607" },
  water: { charId: "67244d8c-b1cd-4ff3-8b81-f2e196111fe2", animId: "d41fde2c-ac7f-4b06-9a42-766ae3f8e9c6" },
  wood: { charId: "0499b6ec-4979-4b99-bdf1-9f5afff6142a", animId: "701c0b09-afb6-46a5-8b89-7e76650b9f01" },
  earth: { charId: "a7997b0a-497f-48ac-962a-038935d811e6", animId: "6abb12f5-444f-4580-aa05-fcdc3595a8df" },
  metal: { charId: "1ed15acc-231a-449f-abf3-d17d65a96ff6", animId: "5d047b10-24d2-402c-9064-cb2cacb4d16d" },
  wind: { charId: "2721b306-6a76-4f89-b14d-2f5f18f960b6", animId: "522ecd49-0323-40ee-ac50-6fa189d3cde0" },
  lightning: { charId: "472f4991-8271-4315-a561-411be083e325", animId: "60f08a8c-1c73-4c65-9b4e-75fb7da647ae" },
  light: { charId: "7e5e71f4-75cd-4606-b601-468500d8c3dd", animId: "924e4da6-96a9-4e3c-a9ba-03a5c772f682" },
  shadow: { charId: "161d9064-0379-4640-ac36-283666461f3a", animId: "de1e0f00-f063-4f3f-9129-4fdd02187dd6" },
};

/** The element-flicker animation is 9 south frames (0..8). */
const FRAME_COUNT = 9;

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

function frameUrl(orbId: string, animId: string, frame: number): string {
  return `https://backblaze.pixellab.ai/file/pixellab-characters/${PIXELLAB_PROJECT}/${orbId}/animations/${animId}/south/${frame}.png`;
}

/** Download a PNG and push it to R2 (idempotent on content hash). */
async function upload(element: string, src: string, field: string, frame: number | "south", orbId: string) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`fetch ${element} ${field} (${res.status}): ${src}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const registered = await registerAsset(supabase, {
    data: bytes,
    contentType: "image/png",
    entityType: "element",
    entityId: element,
    field,
    prompt: `elemental affinity orb — ${element}`,
    endpoint: "create_character",
    generationSize: "96x96",
    generatedVia: "mcp",
    metadata: { pixellab_character_id: orbId, frame },
  });
  return registered;
}

async function main() {
  for (const [element, { charId, animId }] of Object.entries(ORB_BY_ELEMENT)) {
    // Static south frame → orb_url (single-image fallback).
    const still = await upload(element, southUrl(charId), "orb", "south", charId);

    // 9 animation frames → orb_atlas (cycle for the living-element look).
    const atlas: string[] = [];
    for (let f = 0; f < FRAME_COUNT; f++) {
      const reg = await upload(element, frameUrl(charId, animId, f), "orb_frame", f, charId);
      atlas.push(reg.url);
    }

    const { error } = await supabase
      .from("elements")
      .update({ orb_url: still.url, orb_atlas: atlas })
      .eq("id", element);
    if (error) throw new Error(`update ${element}: ${error.message}`);

    console.log(`${element.padEnd(10)} orb=${still.alreadyExisted ? "cached" : "new"} atlas=${atlas.length}f`);
  }
  console.log("\nDone. 9 element orbs wired (static + 9-frame atlas).");
}

main().catch((err) => {
  console.error("\nwire-element-orbs failed:", err);
  process.exit(1);
});
