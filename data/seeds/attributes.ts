/**
 * 4 primary attributes + 20 sub-attributes (5 per primary).
 *
 * Coefficients are the BASE per-point effect. The server multiplies
 * each by the character's primary attr value and the player sees the
 * derived number in the Atributos tab. Values are first-pass balance
 * targets; tune in `data/seeds/attributes.ts` and reseed — no schema
 * migration required.
 *
 * Units (effect_unit):
 *   pct, pct_drop_chance       — percentage (display as "+0.4%")
 *   atk_flat, def_flat,
 *   hp_flat, mp_flat,
 *   matk_flat, weight,
 *   turn_order                 — flat number (display as "+1")
 *   hp_per_turn, mp_per_turn   — per-turn (display as "+0.2/t")
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
  { id: "physical_damage",     parent_attribute_id: "strength",     name: "Physical Damage",       description: "+ATK per point",                         effect_per_point: 1.0, effect_unit: "atk_flat",        sort_order: 1, i18n: { es: { name: "Daño Físico",             description: "+ATK por punto" } } },
  { id: "max_health",          parent_attribute_id: "strength",     name: "Max Health",            description: "+5 HP per point",                        effect_per_point: 5.0, effect_unit: "hp_flat",         sort_order: 2, i18n: { es: { name: "Vida Máxima",            description: "+5 PV por punto" } } },
  { id: "health_regen",        parent_attribute_id: "strength",     name: "Health Regeneration",   description: "+0.2 HP per turn per point",             effect_per_point: 0.2, effect_unit: "hp_per_turn",     sort_order: 3, i18n: { es: { name: "Regeneración de Vida",   description: "+0.2 PV por turno por punto" } } },
  { id: "armor_pen",           parent_attribute_id: "strength",     name: "Armor Penetration",     description: "+0.5% enemy DEF ignored per point",      effect_per_point: 0.5, effect_unit: "pct",             sort_order: 4, i18n: { es: { name: "Penetración de Armadura", description: "+0.5% DEF enemiga ignorada por punto" } } },
  { id: "carry_capacity",      parent_attribute_id: "strength",     name: "Carry Capacity",        description: "+1 inventory weight per point",          effect_per_point: 1.0, effect_unit: "weight",          sort_order: 5, i18n: { es: { name: "Carga Máxima",            description: "+1 peso de inventario por punto" } } },
  // AGI
  { id: "evasion",             parent_attribute_id: "agility",      name: "Evasion",               description: "+0.5% dodge chance per point",           effect_per_point: 0.5, effect_unit: "pct",             sort_order: 1, i18n: { es: { name: "Evasión",                description: "+0.5% prob. de esquivar por punto" } } },
  { id: "crit_damage",         parent_attribute_id: "agility",      name: "Critical Damage",       description: "+1% crit damage per point",              effect_per_point: 1.0, effect_unit: "pct",             sort_order: 2, i18n: { es: { name: "Daño Crítico",           description: "+1% daño crítico por punto" } } },
  { id: "crit_chance",         parent_attribute_id: "agility",      name: "Critical Chance",       description: "+0.4% crit chance per point",            effect_per_point: 0.4, effect_unit: "pct",             sort_order: 3, i18n: { es: { name: "Probabilidad Crítica",  description: "+0.4% prob. crítico por punto" } } },
  { id: "physical_defense",    parent_attribute_id: "agility",      name: "Physical Defense",      description: "+0.5 DEF per point",                     effect_per_point: 0.5, effect_unit: "def_flat",        sort_order: 4, i18n: { es: { name: "Defensa Física",         description: "+0.5 DEF por punto" } } },
  { id: "initiative",          parent_attribute_id: "agility",      name: "Initiative",            description: "+1 turn-order priority per point",       effect_per_point: 1.0, effect_unit: "turn_order",      sort_order: 5, i18n: { es: { name: "Iniciativa",             description: "+1 prioridad de turno por punto" } } },
  // INT
  { id: "max_mana",            parent_attribute_id: "intelligence", name: "Max Mana",              description: "+3 MP per point",                        effect_per_point: 3.0, effect_unit: "mp_flat",         sort_order: 1, i18n: { es: { name: "Maná Máximo",            description: "+3 PM por punto" } } },
  { id: "magic_damage",        parent_attribute_id: "intelligence", name: "Magic Damage",          description: "+1 magic ATK per point",                 effect_per_point: 1.0, effect_unit: "matk_flat",       sort_order: 2, i18n: { es: { name: "Daño Mágico",            description: "+1 ATQ mágico por punto" } } },
  { id: "mana_regen",          parent_attribute_id: "intelligence", name: "Mana Regeneration",     description: "+0.2 MP per turn per point",             effect_per_point: 0.2, effect_unit: "mp_per_turn",     sort_order: 3, i18n: { es: { name: "Regeneración de Maná",   description: "+0.2 PM por turno por punto" } } },
  { id: "cooldown_reduction",  parent_attribute_id: "intelligence", name: "Cooldown Reduction",    description: "+0.3% CDR per point",                    effect_per_point: 0.3, effect_unit: "pct",             sort_order: 4, i18n: { es: { name: "Reducción de Cooldown",  description: "+0.3% CDR por punto" } } },
  { id: "alchemy_potency",     parent_attribute_id: "intelligence", name: "Alchemy Potency",       description: "+0.5% potion/alchemy efficacy per point", effect_per_point: 0.5, effect_unit: "pct",            sort_order: 5, i18n: { es: { name: "Potencia de Alquimia",   description: "+0.5% eficacia de pociones por punto" } } },
  // SPI
  { id: "spirit_health_regen", parent_attribute_id: "spirit",       name: "Spirit Health Regen",   description: "+0.3 HP per turn out of combat per point", effect_per_point: 0.3, effect_unit: "hp_per_turn",   sort_order: 1, i18n: { es: { name: "Regen de Vida Espiritual", description: "+0.3 PV por turno fuera de combate por punto" } } },
  { id: "status_resistance",   parent_attribute_id: "spirit",       name: "Status Resistance",     description: "+0.5% debuff resistance per point",      effect_per_point: 0.5, effect_unit: "pct",             sort_order: 2, i18n: { es: { name: "Resistencia a Estados",  description: "+0.5% resistencia a debuffs por punto" } } },
  { id: "bond_power",          parent_attribute_id: "spirit",       name: "Bond Power",            description: "+0.5% bonded-beast bonus per point",     effect_per_point: 0.5, effect_unit: "pct",             sort_order: 3, i18n: { es: { name: "Poder de Vínculo",       description: "+0.5% bonus de bestia vinculada por punto" } } },
  { id: "fortune",             parent_attribute_id: "spirit",       name: "Fortune",               description: "+0.8% drop chance per point (max ~+40% at 50 pts).", effect_per_point: 0.8, effect_unit: "pct_drop_chance", sort_order: 4, i18n: { es: { name: "Fortuna",      description: "+0.8% prob. de drop por punto (máx ~+40% a 50 pts)." } } },
  { id: "khaos_resonance",     parent_attribute_id: "spirit",       name: "Khaos Resonance",       description: "+0.2% Khaos event chance per point",     effect_per_point: 0.2, effect_unit: "pct",             sort_order: 5, i18n: { es: { name: "Resonancia Khaos",       description: "+0.2% prob. de evento Khaos por punto" } } },
] as const;

export async function seedAttributes(client: SupabaseClient): Promise<SeedReport[]> {
  const reports: SeedReport[] = [];
  reports.push(await upsertWithI18n(client, "attributes",     "attribute",     attributes as readonly { id: string; i18n?: RecordTranslations }[]));
  reports.push(await upsertWithI18n(client, "sub_attributes", "sub_attribute", subAttributes as readonly { id: string; i18n?: RecordTranslations }[]));
  return reports;
}
