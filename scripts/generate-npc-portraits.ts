/**
 * Generate the NPC portraits added in Phase 3a (only Cedric for now;
 * additional NPCs land here as later phases ship them).
 *
 * Same pipeline as `generate-class-portraits.ts`: pixflux 96×96, mood per
 * NPC role, content-hash upload to R2, audit-log row, plus an update of
 * `npcs.portrait_url`.
 *
 * Usage:
 *   pnpm tsx scripts/generate-npc-portraits.ts                       # all
 *   pnpm tsx scripts/generate-npc-portraits.ts cedric_the_broken     # one
 */

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { base64ToBuffer, pixflux } from "../lib/pixellab/client";
import { registerAsset } from "../lib/assets/register";
import { buildPrompt, DEFAULT_NEGATIVES, FRAMING, type Mood } from "../data/art/style";

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

type NpcPrompt = {
  npcId: string;
  name: string;
  mood: Mood;
  description: string;
};

const NPC_PROMPTS: NpcPrompt[] = [
  {
    npcId: "cedric_the_broken",
    name: "Cedric the Broken",
    mood: "serious",
    description:
      "weathered grizzled ex-gladiator master of arms, missing left arm at the elbow, " +
      "right arm wrapped in soot-black bandages, scarred craggy face with a grey iron beard, " +
      "deep-set tired wise eyes that have seen too much, " +
      "leather smithing apron over a rough dark tunic, single small ember-glow accent on his forge tools, " +
      "stoic protective demeanor, the gravitas of a man who has outlived his arena",
  },
];

async function main() {
  const t0 = Date.now();
  let totalCost = 0;

  const requested = process.argv.slice(2);
  let toGenerate = NPC_PROMPTS;
  if (requested.length > 0) {
    const known = new Set(NPC_PROMPTS.map((n) => n.npcId));
    const unknown = requested.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      console.error(`Unknown npc id(s): ${unknown.join(", ")}`);
      console.error(`Known: ${[...known].join(", ")}`);
      process.exit(2);
    }
    toGenerate = NPC_PROMPTS.filter((n) => requested.includes(n.npcId));
    console.log(`Filtering to ${toGenerate.length} NPC(s): ${requested.join(", ")}\n`);
  }

  for (const n of toGenerate) {
    const prompt = buildPrompt({
      subject: n.description,
      mood: n.mood,
      framing: FRAMING.portrait_bust,
    });
    console.log(`\n[${n.npcId}] generating...`);

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
    console.log(`[${n.npcId}] generated in ${elapsed}s, cost $${res.usage.usd.toFixed(4)}`);

    const buffer = base64ToBuffer(res.image.base64);

    const registered = await registerAsset(supabase, {
      data: buffer,
      contentType: "image/png",
      entityType: "npc",
      entityId: n.npcId,
      field: "portrait",
      prompt,
      endpoint: "pixflux",
      generationSize: "96x96",
      costUsd: res.usage.usd,
      generatedVia: "http_api",
      metadata: { npc_name: n.name, view: "side", direction: "south", mood: n.mood },
    });

    totalCost += res.usage.usd;

    const { error: updateErr } = await supabase
      .from("npcs")
      .update({ portrait_url: registered.url })
      .eq("id", n.npcId);
    if (updateErr) throw new Error(`update npcs.portrait_url: ${updateErr.message}`);

    console.log(`[${n.npcId}] ${registered.alreadyExisted ? "cache hit" : "uploaded"} → ${registered.url}`);
  }

  const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `\nDone. ${toGenerate.length} portrait(s) in ${totalElapsed}s. Total PixelLab cost: $${totalCost.toFixed(4)}.`,
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
