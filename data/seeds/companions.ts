/**
 * The 23 companion (pet) families assignable at character birth
 * (docs/DESTINY_ENGINE.md §6). English canonical name + Spanish translation.
 * Ids match the companion ids used in the Destiny Engine occupation/hobby
 * tables (data/destiny/occupations.ts, hobbies.ts). Sprites are wired later.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertWithI18n, type RecordTranslations, type SeedReport } from "./_types";
import { COMPANION_ELEMENTS } from "../destiny/companion-elements";

const companions = [
  { id: "drake", name: "Drake", description: "Fire-blooded dragon companion.", sort_order: 1, i18n: { es: { name: "Draco", description: "Compañero dragón de sangre ardiente." } } },
  { id: "wisp", name: "Wisp", description: "Gentle healing light-spirit.", sort_order: 2, i18n: { es: { name: "Espíritu", description: "Sereno espíritu de luz sanadora." } } },
  { id: "lion_cub", name: "Lion Cub", description: "Brave solar lion.", sort_order: 3, i18n: { es: { name: "Cachorro de León", description: "Valiente león solar." } } },
  { id: "sprite", name: "Forest Sprite", description: "Nurturing leaf-fairy of the woods.", sort_order: 4, i18n: { es: { name: "Hada del Bosque", description: "Hada-hoja protectora del bosque." } } },
  { id: "crystal_familiar", name: "Crystal Familiar", description: "Analytical arcane crystal construct.", sort_order: 5, i18n: { es: { name: "Familiar de Cristal", description: "Constructo arcano de cristal, analítico." } } },
  { id: "imp", name: "Imp", description: "Mischievous shadow trickster.", sort_order: 6, i18n: { es: { name: "Diablillo", description: "Travieso embaucador de las sombras." } } },
  { id: "owlet", name: "Owlet", description: "Wise studious owl.", sort_order: 7, i18n: { es: { name: "Búho", description: "Búho sabio y estudioso." } } },
  { id: "wolf_pup", name: "Wolf Pup", description: "Loyal pack hunter.", sort_order: 8, i18n: { es: { name: "Lobezno", description: "Cazador leal de manada." } } },
  { id: "slime", name: "Slime", description: "Easygoing adaptive blob.", sort_order: 9, i18n: { es: { name: "Slime", description: "Blob adaptable y relajado." } } },
  { id: "phoenix_chick", name: "Phoenix Chick", description: "Resilient reborn firebird.", sort_order: 10, i18n: { es: { name: "Polluelo Fénix", description: "Ave de fuego resiliente que renace." } } },
  { id: "mecha", name: "Automaton", description: "Methodical mechanical companion.", sort_order: 11, i18n: { es: { name: "Autómata", description: "Compañero mecánico metódico." } } },
  { id: "kitten_spirit", name: "Spirit Kitten", description: "Curious agile astral cat.", sort_order: 12, i18n: { es: { name: "Gato Espiritual", description: "Gato astral curioso y ágil." } } },
  { id: "bat", name: "Bat", description: "Nocturnal vampiric flier.", sort_order: 13, i18n: { es: { name: "Murciélago", description: "Volador vampírico nocturno." } } },
  { id: "falcon", name: "Falcon", description: "Precise swift hunter of the skies.", sort_order: 14, i18n: { es: { name: "Halcón", description: "Cazador veloz y preciso del cielo." } } },
  { id: "aerodactyl", name: "Pterosaur", description: "Daring primeval aerial striker.", sort_order: 15, i18n: { es: { name: "Pterosaurio", description: "Audaz atacante aéreo primigenio." } } },
  { id: "bear_cub", name: "Bear Cub", description: "Sturdy protective mountain bear.", sort_order: 16, i18n: { es: { name: "Osezno", description: "Oso de montaña protector y fuerte." } } },
  { id: "fairy", name: "Fairy", description: "Dreamy magical pixie.", sort_order: 17, i18n: { es: { name: "Hada", description: "Hada mágica y soñadora." } } },
  { id: "serpent", name: "Serpent", description: "Patient venomous strategist.", sort_order: 18, i18n: { es: { name: "Serpiente", description: "Estratega venenosa y paciente." } } },
  { id: "demon", name: "Demon", description: "Intense dark-power fiend.", sort_order: 19, i18n: { es: { name: "Demonio", description: "Demonio intenso de poder oscuro." } } },
  { id: "horse_angel", name: "Celestial Steed", description: "Noble healing pegasus.", sort_order: 20, i18n: { es: { name: "Corcel Celestial", description: "Pegaso noble y sanador." } } },
  { id: "horse_dark", name: "Dark Steed", description: "Untamed nightmare of dark fire.", sort_order: 21, i18n: { es: { name: "Corcel Sombrío", description: "Pesadilla indómita de fuego oscuro." } } },
  { id: "dinosaur", name: "Raptor", description: "Ferocious instinctive predator.", sort_order: 22, i18n: { es: { name: "Raptor", description: "Depredador feroz e instintivo." } } },
  { id: "boar", name: "Boar", description: "Tenacious charging tusker.", sort_order: 23, i18n: { es: { name: "Jabalí", description: "Embestidor tenaz de colmillos." } } },
] as const;

/** Canonical rows enriched with their element typing (companion-elements.ts is
 *  the single source of truth for which pets are single- vs dual-element). */
const companionsWithElements = companions.map((c) => {
  const el = COMPANION_ELEMENTS[c.id];
  return {
    ...c,
    element_primary: el?.primary ?? null,
    element_secondary: el?.secondary ?? null,
  };
});

export async function seedCompanions(client: SupabaseClient): Promise<SeedReport[]> {
  return [
    await upsertWithI18n(
      client,
      "companions",
      "companion",
      companionsWithElements as readonly { id: string; i18n?: RecordTranslations }[],
    ),
  ];
}
