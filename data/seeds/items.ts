/**
 * Sample items + 5 representative equipment sets for Phase 1.
 * Full weapon/armor/accessory catalog populates in a later phase.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertWithI18n, type RecordTranslations, type SeedReport } from "./_types";

const itemsMaster = [
  { id: "starter_iron_sword",    name: "Iron Sword (Starter)",        item_type: "weapon",   rarity_id: "common",   description: "Basic iron sword; given by Cedric the Broken to new Damned.",   base_price_khryn: 50,    is_tradeable: true,  is_destroyable_on_death: false, sort_order: 1, i18n: { es: { name: "Espada de Hierro (Inicial)",        description: "Espada de hierro básica; entregada por Cedric el Roto a los nuevos Condenados." } } },
  { id: "starter_leather_chest", name: "Leather Chest (Starter)",     item_type: "armor",    rarity_id: "common",   description: "Basic leather chest; gives minimal protection.",                  base_price_khryn: 40,    is_tradeable: true,  is_destroyable_on_death: false, sort_order: 2, i18n: { es: { name: "Pechera de Cuero (Inicial)",        description: "Pechera de cuero básica; protección mínima." } } },
  { id: "minor_health_potion",   name: "Minor Health Potion",         item_type: "consumable", rarity_id: "common", description: "Restores 50 HP. Cooldown 3 turns.",                              base_price_khryn: 80,    is_tradeable: true,  is_destroyable_on_death: false, sort_order: 3, i18n: { es: { name: "Poción Menor de Vida",              description: "Restaura 50 HP. Cooldown 3 turnos." } } },
  { id: "minor_capture_sphere",  name: "Minor Capture Sphere",        item_type: "consumable", rarity_id: "common", description: "Increases Soul Seal success against Tier I-II mobs.",            base_price_khryn: 400,   is_tradeable: true,  is_destroyable_on_death: false, sort_order: 4, i18n: { es: { name: "Esfera Menor de Captura",           description: "Aumenta éxito de Soul Seal contra mobs Tier I-II." } } },
  { id: "torch",                 name: "Torch",                       item_type: "consumable", rarity_id: "common", description: "Illuminates dark rooms for 10 turns or 30 minutes (whichever first).", base_price_khryn: 150, is_tradeable: true,  is_destroyable_on_death: true, sort_order: 5, i18n: { es: { name: "Antorcha",                          description: "Ilumina rooms oscuros por 10 turnos o 30 minutos (lo que ocurra primero)." } } },
] as const;

const weapons = [
  { item_id: "starter_iron_sword", weapon_class: "sword", base_atk: 12, base_durability: 100, sockets_max: 0, handedness: "one_handed", primary_element_id: null, soul_capacity_size: "s" },
] as const;

const armor = [
  { item_id: "starter_leather_chest", armor_class: "ligera", slot: "chest", base_def: 8, base_durability: 100, sockets_max: 0 },
] as const;

const consumables = [
  { item_id: "minor_health_potion",   consumable_type: "potion",          use_in_combat: true,  cooldown_seconds: 0 },
  { item_id: "minor_capture_sphere",  consumable_type: "esfera_captura",  use_in_combat: true,  cooldown_seconds: 0 },
  { item_id: "torch",                 consumable_type: "antorcha",        use_in_combat: false, cooldown_seconds: 0 },
] as const;

const equipmentSets = [
  { id: "set_runic_titan",       name: "Set of the Runic Titan",          piece_count: 6, is_biome_set: false, biome_id: null,             sort_order: 1, description: "Warrior · Way of Fury · Prestige Lv 40. Forgeable in Ignium.",                       i18n: { es: { name: "Set del Titán Rúnico",       description: "Guerrero · Vía de la Furia · Prestige Nv 40. Forjable en Ignium." } } },
  { id: "set_khaos_wall",        name: "Set of the Khaos Wall",           piece_count: 6, is_biome_set: false, biome_id: null,             sort_order: 2, description: "Warrior · Way of Fortitude · Prestige Lv 40. Materials from the Sentinel.",          i18n: { es: { name: "Set de la Muralla del Khaos", description: "Guerrero · Vía de la Fortaleza · Prestige Nv 40. Materiales del Centinela." } } },
  { id: "set_transcendent_edge", name: "Set of the Transcendent Edge",    piece_count: 6, is_biome_set: false, biome_id: null,             sort_order: 3, description: "Swordsman · Way of the Duel · Prestige Lv 40. Ultra-rare drop from Elite Duelists.",  i18n: { es: { name: "Set de la Hoja Trascendente", description: "Espadachín · Vía del Duelo · Prestige Nv 40. Drop ultra-raro de Duelistas Élite." } } },
  { id: "set_bloody_initiate",   name: "Set of the Bloody Initiate",      piece_count: 6, is_biome_set: false, biome_id: null,             sort_order: 4, description: "Starter Warrior · Way of Fury (gifted by Cedric the Broken).",                       i18n: { es: { name: "Set del Iniciado Sangriento", description: "Gear inicial Guerrero · Vía de la Furia (entregado por Cedric el Roto)." } } },
  { id: "set_abyssal_forest",    name: "Set of the Abyssal Forest",       piece_count: 5, is_biome_set: true,  biome_id: "abyssal_forest", sort_order: 5, description: "Forest biome set (5 pieces, no shield); special drop floor 74.",                     i18n: { es: { name: "Set del Bosque Abisal",      description: "Set de bioma del Bosque (5 piezas, sin escudo); drop especial piso 74." } } },
] as const;

export async function seedItems(client: SupabaseClient): Promise<SeedReport[]> {
  const reports: SeedReport[] = [];
  reports.push(await upsertWithI18n(client, "items_master", "item", itemsMaster as readonly { id: string; i18n?: RecordTranslations }[]));

  // Sub-tables (no translations needed; they reference items_master).
  const { error: wErr } = await client.from("weapons").upsert(weapons as unknown as Record<string, unknown>[], { onConflict: "item_id" });
  if (wErr) throw new Error(`upsert weapons: ${wErr.message}`);
  reports.push({ table: "weapons", rows: weapons.length, translations: 0 });

  const { error: aErr } = await client.from("armor").upsert(armor as unknown as Record<string, unknown>[], { onConflict: "item_id" });
  if (aErr) throw new Error(`upsert armor: ${aErr.message}`);
  reports.push({ table: "armor", rows: armor.length, translations: 0 });

  const { error: cErr } = await client.from("consumables").upsert(consumables as unknown as Record<string, unknown>[], { onConflict: "item_id" });
  if (cErr) throw new Error(`upsert consumables: ${cErr.message}`);
  reports.push({ table: "consumables", rows: consumables.length, translations: 0 });

  reports.push(await upsertWithI18n(client, "equipment_sets", "equipment_set", equipmentSets as readonly { id: string; i18n?: RecordTranslations }[]));
  return reports;
}
