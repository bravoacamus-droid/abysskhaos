/**
 * UI icon URLs for stats, attributes, categories, and currency.
 *
 * All icons are 32×32 monochrome WHITE pixel-art PNGs hosted in R2
 * (content-hashed). Rendered with <img src> + image-rendering:pixelated.
 *
 * Why monochrome white: the user asked for unified styling — every icon
 * the same colour (#FFFFFF) so they read as a coherent UI element set
 * rather than a circus of palettes. Differentiation is silhouette only.
 *
 * Source: painted procedurally in .local-debug/paint-white-icons.ts so
 * we have full control of colour and glyph (vs PixelLab's tendency to
 * add tints/shading we then have to fight). Rerun that script to add
 * or change icons.
 */

export const HP_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/6fbec9694bd47826313ca4af08188d0758508718815b95d8fe2ec9b5fcefc899.png";
export const MP_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/53e47dd21355ae35637e8ca3b0a3e353207c7a862279cbc40516ac2ddd05be03.png";
export const ATK_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/fc095644b5aa4b49157280846a87cf4989877a065322276b319b0f35356c1566.png";
export const DEF_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/5ed41018609bdfe7f674e18ae952eadeb7c15dfdeea92abd7b1fdc4c06eff2a6.png";
export const STR_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/3debb2500eca9e2ac550a0d121e94154233f683282980c23232d9d736e67fa27.png";
export const AGI_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/067010467fec49ca4234c37ee7676848ee46d911c239cc075815ab37ab553a8b.png";
export const INT_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/1409172d8265c6137a61094401fbf916579290cb89fabe00ea4fe350a2c0c2d5.png";
/** Spirit attribute — abbreviated SPI in the canonical attribute seed
 *  (data/seeds/attributes.ts), not SPR. */
export const SPI_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/153fbfb71a03a24b26058e92d45f167a547a7b5a67b2991202b31d6b20f933ce.png";

export const KHRYN_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/ad8c2cf39a3b56fc145f700a667983eb8a831fc8c511aa0d1e200c1caa32de40.png";

export const CAT_WEAPON_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/680f1af5f17af42beaa67d5c851159ddc69db24b612ffffb87cfaa6f658252ff.png";
export const CAT_ARMOR_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/e1e2956dcb6e3e3ef1cd52bac65daa55e3e8692ef1994b9e7e7e1f76ce9c2dd2.png";
export const CAT_ACCESSORY_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/7a658a56bdb3189c8b06c65b7360a78accdc4dcc836580400d94e121e4eefda6.png";
export const CAT_CONSUMABLE_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/033a97a8737fe5809ba8f270f48b2b94cdce65f3be2b199a2e02376cbf9f36c6.png";

/** Lookup helper — returns the icon URL for an items_master.item_type. */
export function categoryIconUrl(itemType: string): string | null {
  switch (itemType) {
    case "weapon":
      return CAT_WEAPON_ICON_URL;
    case "armor":
      return CAT_ARMOR_ICON_URL;
    case "accessory":
      return CAT_ACCESSORY_ICON_URL;
    case "consumable":
      return CAT_CONSUMABLE_ICON_URL;
    default:
      return null;
  }
}
