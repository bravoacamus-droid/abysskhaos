/**
 * Phase 4d — seed the 4 new starter weapons + 1 starter shield so
 * the warrior can test the weapon-family animation system end to
 * end. items_master + weapons/armor sub-rows + i18n names in es/en.
 *
 * Animation family resolver (in CombatOverlay) keys off weapon_class
 * + handedness:
 *   sword + one_handed                   -> sword_1h   (+ shield => sword_1h_shield)
 *   sword + two_handed                   -> sword_2h
 *   axe   + one_handed                   -> axe_1h     (+ shield => axe_1h_shield)
 *   axe   + two_handed                   -> axe_2h
 *
 * Shield is armor with slot=off_hand_shield; equip endpoint already
 * routes it into the off_hand slot.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type ItemMaster = {
  id: string;
  name: string;
  item_type: "weapon" | "armor";
  rarity_id: string;
  description: string;
  base_price_khryn: number;
  is_tradeable: boolean;
  is_destroyable_on_death: boolean;
  sort_order: number;
  i18n_es: { name: string; description: string };
};

const ITEMS: ItemMaster[] = [
  {
    id: "starter_iron_axe",
    name: "Iron Battle Axe (Starter)",
    item_type: "weapon",
    rarity_id: "common",
    description: "Single-handed iron battle axe; brutal one-handed swing.",
    base_price_khryn: 60,
    is_tradeable: true,
    is_destroyable_on_death: false,
    sort_order: 10,
    i18n_es: {
      name: "Hacha de Hierro (Inicial)",
      description: "Hacha de batalla de hierro de una mano; golpe brutal de una mano.",
    },
  },
  {
    id: "starter_iron_greataxe",
    name: "Iron Greataxe (Starter)",
    item_type: "weapon",
    rarity_id: "common",
    description: "Massive two-handed iron greataxe; devastating cleave.",
    base_price_khryn: 100,
    is_tradeable: true,
    is_destroyable_on_death: false,
    sort_order: 11,
    i18n_es: {
      name: "Gran Hacha de Hierro (Inicial)",
      description: "Gran hacha de hierro a dos manos; tajo devastador.",
    },
  },
  {
    id: "starter_iron_greatsword",
    name: "Iron Greatsword (Starter)",
    item_type: "weapon",
    rarity_id: "common",
    description: "Heavy two-handed iron greatsword; powerful overhead cleave.",
    base_price_khryn: 100,
    is_tradeable: true,
    is_destroyable_on_death: false,
    sort_order: 12,
    i18n_es: {
      name: "Espadón de Hierro (Inicial)",
      description: "Pesado espadón de hierro a dos manos; tajo poderoso descendente.",
    },
  },
  {
    id: "starter_iron_shield",
    name: "Iron Round Shield (Starter)",
    item_type: "armor",
    rarity_id: "common",
    description: "Round iron shield; equips in off-hand alongside one-handed weapons.",
    base_price_khryn: 50,
    is_tradeable: true,
    is_destroyable_on_death: false,
    sort_order: 13,
    i18n_es: {
      name: "Escudo Redondo de Hierro (Inicial)",
      description: "Escudo redondo de hierro; se equipa en la mano secundaria junto a armas de una mano.",
    },
  },
];

const WEAPONS = [
  // bonus_str + bonus_hp similar to existing starter sword so stats movement is visible.
  { item_id: "starter_iron_axe",        weapon_class: "axe",   base_atk: 14, base_durability: 100, sockets_max: 0, handedness: "one_handed", primary_element_id: null, soul_capacity_size: "s",
    bonus_str: 1, bonus_agi: 0, bonus_int: 0, bonus_spi: 0, bonus_hp: 12, bonus_mp: 0 },
  { item_id: "starter_iron_greataxe",   weapon_class: "axe",   base_atk: 22, base_durability: 120, sockets_max: 0, handedness: "two_handed", primary_element_id: null, soul_capacity_size: "m",
    bonus_str: 2, bonus_agi: 0, bonus_int: 0, bonus_spi: 0, bonus_hp: 20, bonus_mp: 0 },
  { item_id: "starter_iron_greatsword", weapon_class: "sword", base_atk: 20, base_durability: 120, sockets_max: 0, handedness: "two_handed", primary_element_id: null, soul_capacity_size: "m",
    bonus_str: 2, bonus_agi: 0, bonus_int: 0, bonus_spi: 0, bonus_hp: 18, bonus_mp: 0 },
];

const ARMOR = [
  // Shield slot uses 'off_hand_shield' which equip/route.ts routes to off_hand slot.
  { item_id: "starter_iron_shield", armor_class: "pesada", slot: "off_hand_shield", base_def: 8, base_durability: 100, sockets_max: 0,
    bonus_str: 0, bonus_agi: 0, bonus_int: 0, bonus_spi: 0, bonus_hp: 6, bonus_mp: 0 },
];

(async () => {
  // 1) items_master
  for (const it of ITEMS) {
    const { error: upErr } = await sb.from("items_master").upsert({
      id: it.id,
      name: it.name,
      item_type: it.item_type,
      rarity_id: it.rarity_id,
      description: it.description,
      base_price_khryn: it.base_price_khryn,
      is_tradeable: it.is_tradeable,
      is_destroyable_on_death: it.is_destroyable_on_death,
      sort_order: it.sort_order,
    }, { onConflict: "id" });
    if (upErr) throw upErr;
    // i18n via shared translations table (entity_type=item).
    const { error: iErr } = await sb.from("translations").upsert([
      { entity_type: "item", entity_id: it.id, locale: "es", field: "name",        value: it.i18n_es.name },
      { entity_type: "item", entity_id: it.id, locale: "es", field: "description", value: it.i18n_es.description },
    ], { onConflict: "entity_type,entity_id,locale,field" });
    if (iErr) throw iErr;
    console.log(`  ✓ items_master ${it.id}`);
  }
  // 2) weapons
  const { error: wErr } = await sb.from("weapons").upsert(WEAPONS, { onConflict: "item_id" });
  if (wErr) throw wErr;
  console.log(`  ✓ weapons (+${WEAPONS.length})`);
  // 3) armor (shield)
  const { error: aErr } = await sb.from("armor").upsert(ARMOR, { onConflict: "item_id" });
  if (aErr) throw aErr;
  console.log(`  ✓ armor (+${ARMOR.length})`);
  console.log("done.");
})().catch((err) => { console.error(err); process.exit(1); });
