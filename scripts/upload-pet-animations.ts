/**
 * Pet (companion) animation pipeline — Young stage.
 *
 * For each of the 23 companions: download its PixelLab export ZIP, classify the
 * single-facing (south) animation folders into semantic names, upload each frame
 * to R2 (content-hashed via registerAsset), and write `companions.animation_atlas`.
 *
 * The ZIP keys animations by a SLUG of the action_description prompt (PixelLab
 * does not persist our animation_name), so we classify by keyword:
 *   greeting / attack (melee) / sleep / idea / talk, and SKILL by its leading
 *   element word (FIRE/EARTH/METAL/...). A dual-element pet has TWO skill folders:
 *   the one matching element_PRIMARY becomes "skill", the other "skill_<secondary>".
 *   (So "skill" always = the primary element's cast — what combat plays by default.)
 *
 * atlas shape (single implicit south-west facing — pets are 1-direction):
 *   { greeting:[urls], attack:[...], skill:[...], skill_<sec>:[...], sleep:[...], idea:[...], talk:[...] }
 *
 * Run dry (classify only):  pnpm tsx scripts/upload-pet-animations.ts --dry
 * Run for real (upload):    pnpm tsx scripts/upload-pet-animations.ts
 * One pet:                  pnpm tsx scripts/upload-pet-animations.ts --only=boar [--dry]
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

import { registerAsset } from "../lib/assets/register";
import { COMPANION_ELEMENTS } from "../data/destiny/companion-elements";
import type { ElementId } from "../data/destiny/types";

loadEnv({ path: ".env.local" });

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pixellabKey = process.env.PIXELLAB_API_KEY;
if (!url || !serviceKey || !pixellabKey) {
  console.error("Missing env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / PIXELLAB_API_KEY)");
  process.exit(1);
}
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const DRY = process.argv.includes("--dry");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? null;

/** companionId -> current PixelLab "Young L" character id (redesigns where applicable). */
const PET_CHARS: Record<string, string> = {
  drake: "86f72045-13d9-42bd-a0ab-2b94375ec323",
  wisp: "070efe2e-9ae0-4a9b-882e-168a0d0d369f",
  lion_cub: "8d3e5a76-6598-4ded-b89c-1e208f72d657", // sabertooth
  sprite: "473df03d-1f19-41bf-a2fd-2a1742f2442a",
  crystal_familiar: "1b99f91d-fa89-4e18-87d7-18d42e2cd989",
  imp: "f08d1720-973f-4643-b05c-4ec82430c491",
  owlet: "7fd7d16f-c012-4234-b987-2afe59e0a13a",
  wolf_pup: "cddd56a0-4b00-4265-ae67-da7590227248", // dire wolf
  slime: "be9f3cdc-0efb-49fd-a6a9-1e57745a45da",
  phoenix_chick: "1a886bb7-cb99-4815-b044-699c77f70648",
  mecha: "48eae284-2b7b-42b8-8dd4-e235d300a447",
  kitten_spirit: "bfa6a660-dc0a-4fb4-882f-4e3acd0e5444", // moon
  bat: "d32e0714-90f3-4473-ac4e-cc9d9fb0a9b2",
  falcon: "4786f05a-63c2-4057-ad8f-422f3ec71574",
  aerodactyl: "685d6c36-f861-48d3-8769-9cd501380f34",
  bear_cub: "a884b309-61b2-42ee-b529-346d36a443aa", // panda
  fairy: "a5ea906a-9997-4bad-b160-696a89f68666",
  serpent: "3fb76303-c04a-49c9-92be-de34e10fb657",
  demon: "127086e0-2daa-4447-be53-06f6aed5126f",
  horse_angel: "acb82d26-3258-48e5-ab0e-0fecbccaa233", // masked
  horse_dark: "dfd65859-a0b5-48f6-b98a-ec6e14e90b16", // horned
  dinosaur: "67b8dbf2-1553-4650-a484-a9f3d2a617b5",
  boar: "f7ea416a-d423-4ece-b2de-a9cc39d33732", // blue fire
};

/** Leading element word in a skill slug -> elementId. */
const ELEMENT_KEYWORDS: Array<[RegExp, ElementId]> = [
  [/^blue_fire|^dark_fire/, "fire"],
  [/^fire/, "fire"],
  [/^ice|^water/, "water"],
  [/^wood|^nature/, "wood"],
  [/^earth/, "earth"],
  [/^wind|^air/, "wind"],
  [/^lightning|^thunder/, "lightning"],
  [/^light|^holy/, "light"],
  [/^shadow|^dark(?!_fire)/, "shadow"],
  [/^metal/, "metal"],
];

function skillElement(slug: string): ElementId | null {
  for (const [re, el] of ELEMENT_KEYWORDS) if (re.test(slug)) return el;
  return null;
}

type Kind = "greeting" | "attack" | "sleep" | "idea" | "talk" | "skill";
/** First-pass: bucket a slug. Skills are resolved to primary/secondary later. */
function classify(slug: string): { kind: Kind; element?: ElementId } {
  const s = slug.toLowerCase();
  // Order matters: "idea" before "sleeping" (a "sleepy idea" prompt contains
  // both); use "sleeping" not "sleep" so "sleepy" greetings/ideas don't match.
  if (s.includes("greeting")) return { kind: "greeting" };
  if (s.includes("idea")) return { kind: "idea" };
  if (s.includes("talk") || s.includes("telling_a_story")) return { kind: "talk" };
  if (s.includes("sleeping")) return { kind: "sleep" };
  if (s.includes("_skill") || s.includes("element_skill")) return { kind: "skill", element: skillElement(s) ?? undefined };
  if (s.includes("melee_attack") || s.includes("_attack")) return { kind: "attack" };
  return { kind: "attack" }; // fallthrough; flagged in dry run as ambiguous
}

type ZipAnims = Record<string, { south?: string[] }>;

async function fetchAnimations(charId: string): Promise<{ zip: JSZip; anims: ZipAnims }> {
  const r = await fetch(`https://api.pixellab.ai/mcp/characters/${charId}/download`, {
    headers: { Authorization: `Bearer ${pixellabKey}` },
  });
  if (!r.ok) throw new Error(`zip ${charId}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1024) throw new Error(`zip too small (${buf.length}B) — anims pending?`);
  const zip = await JSZip.loadAsync(buf);
  const raw = JSON.parse(await zip.file("metadata.json")!.async("string"));
  const st0 = raw.states?.[0] ?? raw;
  return { zip, anims: (st0.frames?.animations ?? {}) as ZipAnims };
}

/** Map every slug folder -> final atlas key for one pet. */
function buildKeyMap(companionId: string, anims: ZipAnims): { map: Record<string, string>; warnings: string[] } {
  const el = COMPANION_ELEMENTS[companionId];
  const warnings: string[] = [];
  const map: Record<string, string> = {};
  const skillSlugs: Array<{ slug: string; element: ElementId | null }> = [];

  for (const slug of Object.keys(anims)) {
    const c = classify(slug);
    if (c.kind === "skill") {
      skillSlugs.push({ slug, element: c.element ?? null });
    } else {
      if (map[slug]) warnings.push(`dup ${c.kind}`);
      map[slug] = c.kind;
    }
  }

  if (skillSlugs.length === 1) {
    map[skillSlugs[0]!.slug] = "skill";
  } else if (skillSlugs.length >= 2 && el?.secondary) {
    // primary-element folder -> "skill"; secondary -> "skill_<secondary>"
    const prim = skillSlugs.find((s) => s.element === el.primary);
    const sec = skillSlugs.find((s) => s.element === el.secondary);
    if (prim && sec) {
      map[prim.slug] = "skill";
      map[sec.slug] = `skill_${el.secondary}`;
    } else {
      // element detection failed; keep both deterministically by detected element
      warnings.push(`dual skill match failed (prim=${el.primary} sec=${el.secondary}; got ${skillSlugs.map((s) => s.element).join("/")})`);
      skillSlugs.forEach((s, i) => (map[s.slug] = i === 0 ? "skill" : `skill_${s.element ?? "x"}`));
    }
  } else if (skillSlugs.length >= 2) {
    warnings.push(`${skillSlugs.length} skill folders but pet is single-element`);
    skillSlugs.forEach((s, i) => (map[s.slug] = i === 0 ? "skill" : `skill_${s.element ?? "x"}`));
  }
  return { map, warnings };
}

async function uploadPet(companionId: string, charId: string) {
  const { zip, anims } = await fetchAnimations(charId);
  const { map, warnings } = buildKeyMap(companionId, anims);

  const el = COMPANION_ELEMENTS[companionId];
  const elLabel = el ? (el.secondary ? `${el.primary}+${el.secondary}` : el.primary) : "?";
  console.log(`\n[${companionId}] ${charId}  (${elLabel})`);
  for (const [slug, key] of Object.entries(map)) {
    console.log(`   ${key.padEnd(16)} <- ${slug}  (${anims[slug]?.south?.length ?? 0}f)`);
  }
  warnings.forEach((w) => console.log(`   ⚠ ${w}`));
  const keys = Object.values(map);
  const expected = ["greeting", "attack", "skill", "sleep", "idea", "talk"];
  const missing = expected.filter((k) => !keys.includes(k));
  if (missing.length) console.log(`   ⚠ missing: ${missing.join(", ")}`);

  if (DRY) return;

  const atlas: Record<string, string[]> = {};
  for (const [slug, key] of Object.entries(map)) {
    const paths = anims[slug]?.south ?? [];
    const urls: string[] = [];
    process.stdout.write(`   ${key}: `);
    for (let i = 0; i < paths.length; i++) {
      const data = await zip.file(paths[i]!)!.async("nodebuffer");
      const reg = await registerAsset(supabase, {
        data,
        contentType: "image/png",
        entityType: "companion",
        entityId: companionId,
        field: `anim_${key}_${i}`,
        prompt: `${companionId} ${key} frame ${i}`,
        endpoint: "mcp_animate_character",
        generationSize: "auto",
        generatedVia: "mcp",
        metadata: { pixellab_character_id: charId, animation: key, frame_index: i, facing: "south-west" },
      });
      urls.push(reg.url);
      process.stdout.write(reg.alreadyExisted ? "·" : "+");
    }
    atlas[key] = urls;
    process.stdout.write("\n");
  }

  const { error } = await supabase.from("companions").update({ animation_atlas: atlas }).eq("id", companionId);
  if (error) throw new Error(`update companions.${companionId}: ${error.message}`);
  console.log(`   ✓ companions.${companionId}.animation_atlas (${Object.keys(atlas).length} clips)`);
}

async function main() {
  const t0 = Date.now();
  const entries = Object.entries(PET_CHARS).filter(([id]) => !ONLY || id === ONLY);
  console.log(`${DRY ? "DRY RUN — " : ""}${entries.length} pet(s)`);
  for (const [companionId, charId] of entries) {
    try {
      await uploadPet(companionId, charId);
    } catch (e) {
      console.log(`\n[${companionId}] ✗ ${(e as Error).message}`);
    }
  }
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
