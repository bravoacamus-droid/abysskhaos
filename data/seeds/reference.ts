/**
 * Reference enums: elements, status_effects, rarity_tiers, soul_forge_ranks,
 * damage_types, currencies. English canonical; Spanish translations attached.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertWithI18n, type RecordTranslations, type SeedReport } from "./_types";

const elements = [
  { id: "fire",    name: "Fire",    description: "Flames; strong vs Earth, weak vs Water.",            color_hex: "#E64A19", sort_order: 1, i18n: { es: { name: "Fuego",   description: "Llamas; fuerte vs Tierra, débil vs Agua." } } },
  { id: "water",   name: "Water",   description: "Cold and tides; strong vs Fire/Lightning, weak vs Earth.", color_hex: "#1E88E5", sort_order: 2, i18n: { es: { name: "Agua",    description: "Frío y mareas; fuerte vs Fuego/Rayo, débil vs Tierra." } } },
  { id: "earth",   name: "Earth",   description: "Stone and verdant life; strong vs Lightning/Water, weak vs Wind.", color_hex: "#6D4C41", sort_order: 3, i18n: { es: { name: "Tierra",  description: "Roca y vida vegetal; fuerte vs Rayo/Agua, débil vs Viento." } } },
  { id: "lightning", name: "Lightning", description: "Electricity; strong vs Water/Wind, weak vs Earth.",  color_hex: "#FBC02D", sort_order: 4, i18n: { es: { name: "Rayo",    description: "Electricidad; fuerte vs Agua/Viento, débil vs Tierra." } } },
  { id: "wind",    name: "Wind",    description: "Moving air; strong vs Fire/Arcane, weak vs Earth/Lightning.", color_hex: "#B0BEC5", sort_order: 5, i18n: { es: { name: "Viento",  description: "Aire en movimiento; fuerte vs Fuego/Arcano, débil vs Tierra/Rayo." } } },
  { id: "arcane",  name: "Arcane",  description: "Raw magic; strong vs Shadow, weak vs Light.",          color_hex: "#8E24AA", sort_order: 6, i18n: { es: { name: "Arcano",  description: "Magia bruta; fuerte vs Sombra, débil vs Luz." } } },
  { id: "shadow",  name: "Shadow",  description: "Darkness; strong vs Light, ×2 weak vs Light (only super-effective).", color_hex: "#263238", sort_order: 7, i18n: { es: { name: "Sombra",  description: "Oscuridad; fuerte vs Luz, ×2 débil vs Luz (único superefectivo)." } } },
  { id: "light",   name: "Light",   description: "Sacred; ×2 vs Shadow, weak vs Arcane.",                color_hex: "#FFEE58", sort_order: 8, i18n: { es: { name: "Luz",     description: "Sagrado; ×2 vs Sombra, débil vs Arcano." } } },
] as const;

const statusEffects = [
  // 6 canonical
  { id: "burn",       name: "Burn",       description: "-3% HP per turn from fire or ember.",            base_damage_pct: 3.0,  base_duration_turns: 4,    is_canonical: true, sort_order: 1, i18n: { es: { name: "Quemadura",   description: "-3% HP/turno por fuego o brasa." } } },
  { id: "poison",     name: "Poison",     description: "-2% HP per turn; typical Assassin/Lizalfos vector.", base_damage_pct: 2.0, base_duration_turns: 5, is_canonical: true, sort_order: 2, i18n: { es: { name: "Veneno",      description: "-2% HP/turno; vector típico de Asesinos/Lizalfos." } } },
  { id: "bleed",      name: "Bleed",      description: "-4% HP per turn while moving; from cuts.",       base_damage_pct: 4.0,  base_duration_turns: 4,    is_canonical: true, sort_order: 3, i18n: { es: { name: "Sangrado",    description: "-4% HP/turno al moverse; provocado por cortes." } } },
  { id: "stun",       name: "Stun",       description: "Lose a full turn.",                              base_damage_pct: null, base_duration_turns: 1,    is_canonical: true, sort_order: 4, i18n: { es: { name: "Aturdido",    description: "Pierde 1 turno completo." } } },
  { id: "paralysis",  name: "Paralysis",  description: "50% chance to lose your turn each turn.",        base_damage_pct: null, base_duration_turns: 3,    is_canonical: true, sort_order: 5, i18n: { es: { name: "Paralizado",  description: "50% de perder turno cada turno." } } },
  { id: "curse",      name: "Curse",      description: "-25% to primary stats while active.",            base_damage_pct: null, base_duration_turns: 5,    is_canonical: true, sort_order: 6, i18n: { es: { name: "Maldición",   description: "-25% a stats primarios mientras dure." } } },
  // Non-canonical special debuffs
  { id: "confusion",  name: "Confusion",  description: "Random action; from Keese / Carnivorous Mushroom.", base_damage_pct: null, base_duration_turns: 1, is_canonical: false, sort_order: 10, i18n: { es: { name: "Confusión",    description: "Acción aleatoria; aplicable por Keese/Hongo Carnívoro." } } },
  { id: "silenced",   name: "Silenced",   description: "Cannot cast active abilities.",                  base_damage_pct: null, base_duration_turns: 2,    is_canonical: false, sort_order: 11, i18n: { es: { name: "Silenciado",  description: "No puede lanzar habilidades activas." } } },
  { id: "frozen",     name: "Frozen",     description: "Cannot act; weakens crowd-control resistance.",  base_damage_pct: null, base_duration_turns: 2,    is_canonical: false, sort_order: 12, i18n: { es: { name: "Congelado",   description: "No puede actuar; debilita resistencia a control." } } },
  { id: "sleep",      name: "Sleep",      description: "Idle until taking damage.",                      base_damage_pct: null, base_duration_turns: 2,    is_canonical: false, sort_order: 13, i18n: { es: { name: "Dormido",     description: "No actúa hasta recibir daño." } } },
  { id: "fear",       name: "Fear",       description: "Forced to flee; loses offensive action.",        base_damage_pct: null, base_duration_turns: 2,    is_canonical: false, sort_order: 14, i18n: { es: { name: "Miedo",       description: "Forzado a alejarse; pierde acción ofensiva." } } },
  { id: "wet",        name: "Wet",        description: "Vulnerable to Lightning (+50% damage taken).",   base_damage_pct: null, base_duration_turns: 3,    is_canonical: false, sort_order: 15, i18n: { es: { name: "Mojado",      description: "Vulnerable a Rayo (+50% recibido)." } } },
  { id: "corrosion",  name: "Corrosion",  description: "-1.5% HP per turn + reduces DEF.",               base_damage_pct: 1.5,  base_duration_turns: 4,    is_canonical: false, sort_order: 16, i18n: { es: { name: "Corrosión",   description: "-1.5% HP/turno + reduce DEF." } } },
  { id: "immobilized", name: "Immobilized", description: "Cannot change tile (Sticky Web, Trap).",       base_damage_pct: null, base_duration_turns: 1,    is_canonical: false, sort_order: 17, i18n: { es: { name: "Inmovilizado", description: "No puede cambiar de tile (Tela Pegajosa, Trampa)." } } },
  { id: "pushed",     name: "Pushed",     description: "Pushed to adjacent tile.",                      base_damage_pct: null, base_duration_turns: 1,    is_canonical: false, sort_order: 18, i18n: { es: { name: "Empujado",    description: "Empujado a tile adyacente." } } },
  { id: "slowed",     name: "Slowed",     description: "-X% attack speed.",                             base_damage_pct: null, base_duration_turns: 2,    is_canonical: false, sort_order: 19, i18n: { es: { name: "Ralentizado",  description: "-X% velocidad de ataque." } } },
  { id: "asphyxia",   name: "Asphyxia",   description: "Aquatic variant of drowning damage.",            base_damage_pct: 5.0,  base_duration_turns: 5,    is_canonical: false, sort_order: 20, i18n: { es: { name: "Asfixia",     description: "Variante acuática (Ahogado)." } } },
] as const;

const rarityTiers = [
  { id: "common",     name: "Common",     color_hex: "#9E9E9E", is_nft_eligible: false, sort_order: 1, i18n: { es: { name: "Común" } } },
  { id: "uncommon",   name: "Uncommon",   color_hex: "#4FC3F7", is_nft_eligible: false, sort_order: 2, i18n: { es: { name: "Inusual" } } },
  { id: "rare",       name: "Rare",       color_hex: "#1976D2", is_nft_eligible: false, sort_order: 3, i18n: { es: { name: "Raro" } } },
  { id: "magic",      name: "Magic",      color_hex: "#43A047", is_nft_eligible: false, sort_order: 4, i18n: { es: { name: "Mágico" } } },
  { id: "epic",       name: "Epic",       color_hex: "#8E24AA", is_nft_eligible: true,  sort_order: 5, i18n: { es: { name: "Épico" } } },
  { id: "legendary",  name: "Legendary",  color_hex: "#FB8C00", is_nft_eligible: true,  sort_order: 6, i18n: { es: { name: "Legendario" } } },
  { id: "unique",     name: "Unique",     color_hex: "#D32F2F", is_nft_eligible: true,  sort_order: 7, i18n: { es: { name: "Único" } } },
] as const;

const soulForgeRanks = [
  { id: "f",         name: "F",        battle_threshold_min: 0,    battle_threshold_max: 20,   bonus_stat_pct: 10,  has_awakening: false, sort_order: 1 },
  { id: "e",         name: "E",        battle_threshold_min: 21,   battle_threshold_max: 60,   bonus_stat_pct: 25,  has_awakening: false, sort_order: 2 },
  { id: "d",         name: "D",        battle_threshold_min: 61,   battle_threshold_max: 150,  bonus_stat_pct: 50,  has_awakening: false, sort_order: 3 },
  { id: "c",         name: "C",        battle_threshold_min: 151,  battle_threshold_max: 400,  bonus_stat_pct: 75,  has_awakening: false, sort_order: 4 },
  { id: "b",         name: "B",        battle_threshold_min: 401,  battle_threshold_max: 900,  bonus_stat_pct: 100, has_awakening: true,  sort_order: 5 },
  { id: "a",         name: "A",        battle_threshold_min: 901,  battle_threshold_max: 1800, bonus_stat_pct: 125, has_awakening: true,  sort_order: 6 },
  { id: "s",         name: "S",        battle_threshold_min: 1801, battle_threshold_max: 3000, bonus_stat_pct: 150, has_awakening: true,  sort_order: 7 },
  { id: "ss_omega", name: "SS Omega",  battle_threshold_min: 3001, battle_threshold_max: null, bonus_stat_pct: 200, has_awakening: true,  sort_order: 8 },
] as const;

const damageTypes = [
  { id: "physical",  name: "Physical",  description: "Melee/projectile base damage; mitigated by DEF.", sort_order: 1, i18n: { es: { name: "Físico",     description: "Daño base de armas cuerpo-a-cuerpo/proyectil; mitigado por DEF." } } },
  { id: "magical",   name: "Magical",   description: "Magical damage; mitigated by magical DEF.",        sort_order: 2, i18n: { es: { name: "Mágico",     description: "Daño mágico; mitigado por DEF mágica." } } },
  { id: "true",      name: "True",      description: "Ignores DEF (e.g. Khaos Bullet, Khaos Cut).",      sort_order: 3, i18n: { es: { name: "Verdadero",  description: "Ignora DEF (ej. Bala del Khaos, Corte del Khaos)." } } },
  { id: "elemental", name: "Elemental", description: "Damage tagged by element; affinity table applies.", sort_order: 4, i18n: { es: { name: "Elemental",  description: "Daño marcado por elemento; aplica tabla de afinidades." } } },
] as const;

const currencies = [
  { id: "khryn",        name: "Khryn",            is_onchain: false, decimals: 0, chain: null,    sort_order: 1 },
  { id: "usdt",         name: "USDT",             is_onchain: true,  decimals: 6, chain: "ton",   sort_order: 2 },
  { id: "ton",          name: "TON",              is_onchain: true,  decimals: 9, chain: "ton",   sort_order: 3 },
  { id: "khaos_token",  name: "$KHAOS",           is_onchain: true,  decimals: 9, chain: "ton",   sort_order: 4 },
  { id: "esfera_luz",   name: "Sunlight Sphere",  is_onchain: false, decimals: 0, chain: null,    sort_order: 5, i18n: { es: { name: "Esfera de Luz Solar" } } },
  { id: "alma_errante", name: "Wandering Soul",   is_onchain: false, decimals: 0, chain: null,    sort_order: 6, i18n: { es: { name: "Alma Errante" } } },
] as const;

export async function seedReference(client: SupabaseClient): Promise<SeedReport[]> {
  const reports: SeedReport[] = [];
  reports.push(await upsertWithI18n(client, "elements",         "element",         elements as readonly { id: string; i18n?: RecordTranslations }[]));
  reports.push(await upsertWithI18n(client, "status_effects",   "status_effect",   statusEffects as readonly { id: string; i18n?: RecordTranslations }[]));
  reports.push(await upsertWithI18n(client, "rarity_tiers",     "rarity_tier",     rarityTiers as readonly { id: string; i18n?: RecordTranslations }[]));
  reports.push(await upsertWithI18n(client, "soul_forge_ranks", "soul_forge_rank", soulForgeRanks as readonly { id: string; i18n?: RecordTranslations }[]));
  reports.push(await upsertWithI18n(client, "damage_types",     "damage_type",     damageTypes as readonly { id: string; i18n?: RecordTranslations }[]));
  reports.push(await upsertWithI18n(client, "currencies",       "currency",        currencies as readonly { id: string; i18n?: RecordTranslations }[]));
  return reports;
}
