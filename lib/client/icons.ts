/**
 * UI icon URLs for stats, attributes, categories, and currency.
 *
 * All icons are 32×32 PixelLab-generated PNGs the user finalized and
 * tagged 'icon-final' in their PixelLab project (id 8d5dc016-…),
 * pulled into our R2 (content-hashed, stable) via
 * `.local-debug/import-pixellab-icons.ts`. Re-run that script if a tag
 * gets re-pointed.
 *
 * Rendering: <img src> + image-rendering:pixelated for the crisp look.
 */

export const HP_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/2fb48f00f601e6d0ffebdd2cb7d07c5be4fab12659d6b72928fef2664ded7f42.png";
export const MP_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/7121244394160eb9d698823d1bf75abd1ba574b0b023711369eeec34578c8fde.png";
export const ATK_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/1b94eda94dc45b6bb156646125d2344d5987ec848543f561f5755d03583a54a3.png";
export const DEF_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/cf70c60c1c94f502cdb07647247943b5aebeadb6d069db5cbe03b9e6a88d7c38.png";
export const STR_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/d8fe56383e7183dd9b021ac7a7f5b61ccb92e8c52cfa4a9cd12cd3853b4c3ffd.png";
export const AGI_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/5b12d7453e970f75150a787cffa6bd44b02e5b10d6b6f47cf1b97d08a6e6cde7.png";
export const INT_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/a4569889e31e508a4ef44f489cb44ad27fb9229f39bd2b32f585628bf1dfeafc.png";
/** Spirit attribute — abbreviated SPI in the canonical attribute seed. */
export const SPI_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/5f67e748f335f4b329bd7e517d97b3d6b44934c09b5ac0bb1a7b32315c4c556a.png";

export const KHRYN_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/1a10d5b4e02523cdf298dbdc8d924d04dfd7804b1a67826d219c7a8ac0709f9c.png";

/** WEAPON category not yet finalized in PixelLab — reusing the ATK
 *  sword reads correctly for both "weapon category" and "attack stat". */
export const CAT_WEAPON_ICON_URL = ATK_ICON_URL;
export const CAT_ARMOR_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/72c8f68c0356d523a83b95d29ac7dd48f8f5affcbaa67178d91a4424cf6e6984.png";
export const CAT_ACCESSORY_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/eaa65e0c4d530f6d237254de35155e35932c021be2efd3983fcb500ad283301a.png";
export const CAT_CONSUMABLE_ICON_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/596a8e086c1c05a11c44ffb9bdef1dcf1ad22063446c76639d760f37a65650ef.png";

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
