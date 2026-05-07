/**
 * Art style anchor + mood system for every PixelLab generation.
 *
 * Rules in `docs/CANON.md` §"Estilo visual de referencia" and §"Eje de tono"
 * are binding: every prompt sent to PixelLab MUST flow through `buildPrompt`.
 * If you find yourself string-templating prompts inline, stop and add the
 * helper here instead.
 */

/**
 * Six canonical visual references — the union of Doc 1 (Pokemon was here but
 * not in Doc 5) and Doc 5 (Octopath / Chrono Trigger / Hades). All 6 always
 * appear in the prompt; the mood layer below tilts which one dominates.
 */
export const STYLE_REFERENCES = [
  "Final Fantasy VI",
  "Chrono Trigger",
  "Pokemon",
  "Hollow Knight",
  "Octopath Traveler",
  "Hades",
] as const;

/** Hard-coded palette + medium constraints from Doc 5 §5. */
export const MEDIUM_CONSTRAINTS =
  "pixel art, dark fantasy RPG aesthetic, neon-on-void palette, high contrast, " +
  "limited palette of about 32 colors, max 4 shades per base color, " +
  "clean readable silhouette";

export type Mood = "friendly" | "serious" | "epic" | "mixed";

/**
 * Mood presets translate the abstract tone into concrete visual instructions
 * the model can act on. They MUST stay short and concrete: vague prompts
 * give vague output.
 */
export const MOOD_PRESETS: Record<Mood, string> = {
  friendly:
    "Pokemon-inspired charm, expressive face, big eyes, soft rounded outlines, " +
    "warm approachable pose, bright clean colors, welcoming silhouette",
  serious:
    "FF VI and Octopath Traveler inspired, mature focused character, weathered details, " +
    "balanced contemplative pose, muted palette with a single accent color, sense of gravitas",
  epic:
    "Hades inspired, dramatic dynamic pose, cinematic rim lighting, glowing energy accents, " +
    "intense piercing expression, saturated highlights, mythic power, Chrono Trigger boss-reveal vibe",
  mixed:
    "blend of expressive face and mature posture, soft outlines yet dramatic lighting, " +
    "approachable yet serious, drawing equally from Pokemon, FF VI, and Hades",
};

/** Standard negatives — strip out the noise that PixelLab tends to add. */
export const DEFAULT_NEGATIVES =
  "text, watermark, signature, logo, multiple characters, blurry, photorealistic, 3d render, " +
  "modern photograph, anime screencap";

export type BuildPromptInput = {
  /** The subject of the image: e.g. "muscular bearded warrior in iron plate armor". */
  subject: string;
  /** Tonal axis (Pokemon-friendly to Hades-epic). */
  mood: Mood;
  /** Composition: "head and shoulders portrait", "8-direction walking sprite", etc. */
  framing: string;
  /** Optional extras: biome accents, signature props, color hints. */
  extra?: string;
};

/**
 * Compose the full prompt sent to PixelLab. Every generation in the project
 * goes through here so the style anchor stays consistent across phases.
 */
export function buildPrompt(input: BuildPromptInput): string {
  const styleAnchor = `inspired by ${STYLE_REFERENCES.join(", ")}`;
  const parts = [
    input.subject,
    input.framing,
    MEDIUM_CONSTRAINTS,
    styleAnchor,
    MOOD_PRESETS[input.mood],
    input.extra,
  ].filter(Boolean);
  return parts.join(". ");
}
