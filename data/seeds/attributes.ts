/**
 * 4 primary attributes + 20 sub-attributes (5 per primary).
 *
 * Only `fortune` (under SPI) has a canonical coefficient (+0.8% drop chance
 * per point). Other coefficients remain null pending balance pass.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertWithI18n, type RecordTranslations, type SeedReport } from "./_types";

const attributes = [
  { id: "strength",     name: "Strength",     abbrev: "STR", description: "Physical damage, life and resilience. Primary of Warrior/Swordsman.",        sort_order: 1, i18n: { es: { name: "Fuerza",      description: "Daño físico, vida y resistencia. Principal de Guerrero/Espadachín." } } },
  { id: "agility",      name: "Agility",      abbrev: "AGI", description: "Speed, evasion, critical. Primary of Assassin/Infiltrator.",                  sort_order: 2, i18n: { es: { name: "Agilidad",    description: "Velocidad, evasión, crítico. Principal de Asesino/Infiltrador." } } },
  { id: "intelligence", name: "Intelligence", abbrev: "INT", description: "Magical damage and mana capacity. Primary of Mage.",                          sort_order: 3, i18n: { es: { name: "Inteligencia", description: "Daño mágico y capacidad de magia. Principal de Mago." } } },
  { id: "spirit",       name: "Spirit",       abbrev: "SPI", description: "The only attribute that affects mechanics OUTSIDE combat (drops, resistance, bond).", sort_order: 4, i18n: { es: { name: "Espíritu",    description: "Único atributo que afecta mecánicas FUERA de combate." } } },
] as const;

const subAttributes = [
  // STR
  { id: "physical_damage",     parent_attribute_id: "strength",     name: "Physical Damage",       description: "+ATK flat",          effect_per_point: null, effect_unit: "atk_flat",     sort_order: 1, i18n: { es: { name: "Daño Físico" } } },
  { id: "max_health",          parent_attribute_id: "strength",     name: "Max Health",            description: "+HP flat",           effect_per_point: null, effect_unit: "hp_flat",      sort_order: 2, i18n: { es: { name: "Vida Máxima" } } },
  { id: "health_regen",        parent_attribute_id: "strength",     name: "Health Regeneration",   description: "+HP per turn",       effect_per_point: null, effect_unit: "hp_per_turn",  sort_order: 3, i18n: { es: { name: "Regeneración de Vida" } } },
  { id: "armor_pen",           parent_attribute_id: "strength",     name: "Armor Penetration",     description: "% DEF ignored",      effect_per_point: null, effect_unit: "pct",          sort_order: 4, i18n: { es: { name: "Penetración de Armadura" } } },
  { id: "carry_capacity",      parent_attribute_id: "strength",     name: "Carry Capacity",        description: "Inventory weight",   effect_per_point: null, effect_unit: "weight",       sort_order: 5, i18n: { es: { name: "Carga Máxima" } } },
  // AGI
  { id: "evasion",             parent_attribute_id: "agility",      name: "Evasion",               description: "% chance to dodge",  effect_per_point: null, effect_unit: "pct",          sort_order: 1, i18n: { es: { name: "Evasión" } } },
  { id: "crit_damage",         parent_attribute_id: "agility",      name: "Critical Damage",       description: "% crit damage bonus", effect_per_point: null, effect_unit: "pct",         sort_order: 2, i18n: { es: { name: "Daño Crítico" } } },
  { id: "crit_chance",         parent_attribute_id: "agility",      name: "Critical Chance",       description: "% crit chance",      effect_per_point: null, effect_unit: "pct",          sort_order: 3, i18n: { es: { name: "Probabilidad Crítica" } } },
  { id: "physical_defense",    parent_attribute_id: "agility",      name: "Physical Defense",      description: "+DEF flat",          effect_per_point: null, effect_unit: "def_flat",     sort_order: 4, i18n: { es: { name: "Defensa Física" } } },
  { id: "initiative",          parent_attribute_id: "agility",      name: "Initiative",            description: "Turn order priority", effect_per_point: null, effect_unit: "turn_order",  sort_order: 5, i18n: { es: { name: "Iniciativa" } } },
  // INT
  { id: "max_mana",            parent_attribute_id: "intelligence", name: "Max Mana",              description: "+MP flat",           effect_per_point: null, effect_unit: "mp_flat",      sort_order: 1, i18n: { es: { name: "Maná Máximo" } } },
  { id: "magic_damage",        parent_attribute_id: "intelligence", name: "Magic Damage",          description: "+magic ATK flat",    effect_per_point: null, effect_unit: "matk_flat",    sort_order: 2, i18n: { es: { name: "Daño Mágico" } } },
  { id: "mana_regen",          parent_attribute_id: "intelligence", name: "Mana Regeneration",     description: "+MP per turn",       effect_per_point: null, effect_unit: "mp_per_turn",  sort_order: 3, i18n: { es: { name: "Regeneración de Maná" } } },
  { id: "cooldown_reduction",  parent_attribute_id: "intelligence", name: "Cooldown Reduction",    description: "% CDR",              effect_per_point: null, effect_unit: "pct",          sort_order: 4, i18n: { es: { name: "Reducción de Cooldown" } } },
  { id: "alchemy_potency",     parent_attribute_id: "intelligence", name: "Alchemy Potency",       description: "% efficacy of potions/transmutation", effect_per_point: null, effect_unit: "pct", sort_order: 5, i18n: { es: { name: "Potencia de Alquimia" } } },
  // SPI
  { id: "spirit_health_regen", parent_attribute_id: "spirit",       name: "Spirit Health Regen",   description: "+HP/turn out of combat", effect_per_point: null, effect_unit: "hp_per_turn", sort_order: 1, i18n: { es: { name: "Regen de Vida Espiritual" } } },
  { id: "status_resistance",   parent_attribute_id: "spirit",       name: "Status Resistance",     description: "% resistance to debuffs", effect_per_point: null, effect_unit: "pct",        sort_order: 2, i18n: { es: { name: "Resistencia a Estados" } } },
  { id: "bond_power",          parent_attribute_id: "spirit",       name: "Bond Power",            description: "% beast bonus",      effect_per_point: null, effect_unit: "pct",          sort_order: 3, i18n: { es: { name: "Poder de Vínculo" } } },
  { id: "fortune",             parent_attribute_id: "spirit",       name: "Fortune",               description: "+0.8% drop chance per point (max ~+40% at 50 pts).", effect_per_point: 0.8, effect_unit: "pct_drop_chance", sort_order: 4, i18n: { es: { name: "Fortuna",      description: "+0.8% drop chance por punto (máx ~+40% a 50 pts)." } } },
  { id: "khaos_resonance",     parent_attribute_id: "spirit",       name: "Khaos Resonance",       description: "% chance of Khaos events", effect_per_point: null, effect_unit: "pct",      sort_order: 5, i18n: { es: { name: "Resonancia Khaos" } } },
] as const;

export async function seedAttributes(client: SupabaseClient): Promise<SeedReport[]> {
  const reports: SeedReport[] = [];
  reports.push(await upsertWithI18n(client, "attributes",     "attribute",     attributes as readonly { id: string; i18n?: RecordTranslations }[]));
  reports.push(await upsertWithI18n(client, "sub_attributes", "sub_attribute", subAttributes as readonly { id: string; i18n?: RecordTranslations }[]));
  return reports;
}
