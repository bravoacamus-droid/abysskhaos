/**
 * Phase 2: generate the 5 class portraits via PixelLab `pixflux`,
 * upload to R2, register in `asset_generations`, and write the URL
 * into `classes.portrait_url`.
 *
 * Idempotent: re-running with the same prompts yields the same hashes
 * and short-circuits the upload. Cost: 5 × ~$0.012 = ~$0.06 USD.
 *
 * Usage:  pnpm tsx scripts/generate-class-portraits.ts
 */

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { base64ToBuffer, pixflux } from "../lib/pixellab/client";
import { registerAsset } from "../lib/assets/register";
import { buildPrompt, DEFAULT_NEGATIVES, type Mood } from "../data/art/style";

loadEnv({ path: ".env.local" });

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

// The 5 base classes are the player's "Damned" — mature heroes descending
// into the abyss. Per CANON.md §8 they're `serious` mood: weathered, FF VI /
// Octopath gravitas with a single accent color, not Pokemon-cute and not
// Hades-epic. Bosses and Entidades will lean epic in later phases.
const CLASS_MOOD: Mood = "serious";

const FRAMING = "head and shoulders portrait, single character centered, transparent background, facing slightly forward";

type ClassPrompt = {
  classId: string;
  name: string;
  description: string;
};

const CLASS_PROMPTS: ClassPrompt[] = [
  {
    classId: "warrior",
    name: "Warrior",
    description:
      "muscular human warrior, weathered scarred face, heavy iron plate armor with crimson trim, " +
      "shoulder pauldrons, holding a great two-handed sword over the shoulder, fierce determined expression, " +
      "short dark hair, glowing amber eyes",
  },
  {
    classId: "swordsman",
    name: "Swordsman",
    description:
      "lean human swordsman, focused calm expression, light steel cuirass over dark blue tunic, " +
      "leather pauldrons, holding an elegant longsword vertically in front of him, sharp jawline, " +
      "neat short hair, pale blue eyes",
  },
  {
    classId: "assassin",
    name: "Assassin",
    description:
      "agile human assassin in dark hooded cloak, only the lower half of the face visible, " +
      "twin curved daggers crossed at the chest, leather armor with violet accents, " +
      "smirking confident mouth, mysterious silhouette",
  },
  {
    classId: "infiltrator",
    name: "Infiltrator",
    description:
      "stealthy human infiltrator, half-mask covering nose and mouth, tactical gear with cyan circuitry, " +
      "holstered pistol on hip and goggles on forehead, alert calculating expression, " +
      "messy dark hair, glowing cyan visor lights",
  },
  {
    classId: "mage",
    name: "Mage",
    description:
      "ethereal human mage, long flowing robes in deep purple and gold trim, glowing arcane runes on hood, " +
      "holding a staff topped with a violet crystal, serene mystical expression, " +
      "long silver hair, glowing violet eyes",
  },
];

async function main() {
  const t0 = Date.now();
  let totalCost = 0;

  for (const c of CLASS_PROMPTS) {
    const prompt = buildPrompt({
      subject: c.description,
      mood: CLASS_MOOD,
      framing: FRAMING,
    });
    console.log(`\n[${c.classId}] generating...`);

    const stageT0 = Date.now();
    const res = await pixflux({
      description: prompt,
      negative_description: DEFAULT_NEGATIVES,
      image_size: { width: 96, height: 96 },
      no_background: true,
      outline: "single color black outline",
      shading: "medium shading",
      detail: "highly detailed",
      view: "side",
    });
    const elapsed = ((Date.now() - stageT0) / 1000).toFixed(1);
    console.log(`[${c.classId}] generated in ${elapsed}s, cost $${res.usage.usd.toFixed(4)}`);

    const buffer = base64ToBuffer(res.image.base64);

    const registered = await registerAsset(supabase, {
      data: buffer,
      contentType: "image/png",
      entityType: "class",
      entityId: c.classId,
      field: "portrait",
      prompt,
      endpoint: "pixflux",
      generationSize: "96x96",
      costUsd: res.usage.usd,
      generatedVia: "http_api",
      metadata: { class_name: c.name, view: "side", direction: "south", mood: CLASS_MOOD },
    });

    totalCost += res.usage.usd;

    const { error: updateErr } = await supabase
      .from("classes")
      .update({ portrait_url: registered.url })
      .eq("id", c.classId);
    if (updateErr) throw new Error(`update classes.portrait_url: ${updateErr.message}`);

    console.log(`[${c.classId}] ${registered.alreadyExisted ? "cache hit" : "uploaded"} → ${registered.url}`);
  }

  const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `\nDone. 5 portraits in ${totalElapsed}s. Total PixelLab cost: $${totalCost.toFixed(4)}.`,
  );
}

main().catch((err) => {
  console.error("\nGenerate failed:");
  if (err && typeof err === "object" && "body" in err) {
    console.error("  status:", (err as { status: number }).status);
    console.error("  body:", JSON.stringify((err as { body: unknown }).body, null, 2));
  } else {
    console.error(err);
  }
  process.exit(1);
});
