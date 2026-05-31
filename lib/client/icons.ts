/**
 * UI icon URLs for stats, attributes, categories, and currency.
 *
 * All icons are 32×32 PixelLab-generated PNGs the user curated and
 * tagged in their PixelLab project. Pulled into our R2 (content-
 * hashed, audit-tracked via asset_generations) by
 * `.local-debug/import-pixellab-icons.ts`. To swap an icon, retag
 * the new chosen variant with the same Spanish name (fuerza,
 * agilidad, …) in PixelLab and rerun that script.
 */

// Spanish-tagged finalised icons.
export const STR_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/214aadce9545bd18615f11a626d50d94ac54a70178ab23be4071632cc39955ef.png";
export const AGI_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/e24ca545d48dedf0e9f0293eb3999d136c148426a7f5ffd03e845ff17b041918.png";
export const INT_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/822a601ebccfc672d2827e618e747f8e3f72ad6143c164d069dcac7faf762b6f.png";
export const SPI_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/1f4935c22e68ab655dff149b3cfc1ea3df103258ecdd3ff3f05a62950ec40753.png";
export const HP_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/4d6d7e6b70d90fc5df4e129e3e9be76821b0075c7a794888f5916a5515cf8160.png";
export const MP_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/10f186ffcb27a762e82db6562012a4e066741ab2ee4f7ebe19788c7dcd1f6b46.png";
export const DEF_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/51b8631e5a5a975bdd61a5d049887ab216bf9239821058ba01ab1fdf0a000f81.png";

// No Spanish tag yet — fall back to the earlier 'icon-final' batch.
export const ATK_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/1b94eda94dc45b6bb156646125d2344d5987ec848543f561f5755d03583a54a3.png";
export const KHRYN_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/1a10d5b4e02523cdf298dbdc8d924d04dfd7804b1a67826d219c7a8ac0709f9c.png";

/** WEAPON category not yet finalized in PixelLab — reuse ATK sword. */
export const CAT_WEAPON_ICON_URL = ATK_ICON_URL;
export const CAT_ARMOR_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/72c8f68c0356d523a83b95d29ac7dd48f8f5affcbaa67178d91a4424cf6e6984.png";
export const CAT_ACCESSORY_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/eaa65e0c4d530f6d237254de35155e35932c021be2efd3983fcb500ad283301a.png";
export const CAT_CONSUMABLE_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/fb73a63572f5048c4d1ad8dabac5da9351d419564c7bf2741e03670d82384362.png";

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
