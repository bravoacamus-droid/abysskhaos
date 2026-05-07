/**
 * World data: 10 biomes, 100 floors, 5 cities.
 * Floor names: only canonical names from Doc 4 / Doc 10 are used; unnamed
 * floors stay as `Floor N` placeholders (en) and `Piso N` (es).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertWithI18n, type RecordTranslations, type SeedReport } from "./_types";

const biomes = [
  { id: "threshold",         name: "Threshold",                primary_color_hex: "#6A1B9A", secondary_color_hex: null,      description: "Starting zone; ruins with bioluminescent crystals (floors 95-100).",                  sort_order: 1, i18n: { es: { name: "Umbral",                   description: "Zona de inicio; ruinas con cristales bioluminiscentes (pisos 95-100)." } } },
  { id: "first_era_ruins",   name: "First Era Ruins",          primary_color_hex: "#B0BEC5", secondary_color_hex: null,      description: "Remnants of an ancient civilization; constructs and elementals (80-94).",            sort_order: 2, i18n: { es: { name: "Ruinas de la Primera Era",  description: "Restos de civilización antigua; constructos y elementales (80-94)." } } },
  { id: "khaos_catacombs",   name: "Khaos Catacombs",          primary_color_hex: "#37474F", secondary_color_hex: null,      description: "Black water rivers and undead (65-79).",                                              sort_order: 3, i18n: { es: { name: "Catacumbas del Khaos",      description: "Ríos de agua negra y muertos vivientes (65-79)." } } },
  { id: "abyssal_forest",    name: "Abyssal Forest",           primary_color_hex: "#4A148C", secondary_color_hex: null,      description: "Giant violet-glowing mushrooms; sentient trees (50-64).",                            sort_order: 4, i18n: { es: { name: "Bosque Abisal",             description: "Hongos gigantes con luz violeta; árboles conscientes (50-64)." } } },
  { id: "primordial_jungle", name: "Primordial Jungle",        primary_color_hex: "#2E7D32", secondary_color_hex: null,      description: "Dinosaurs; high temperature; cooldowns 10% slower (39-49).",                         sort_order: 5, i18n: { es: { name: "Jungla Primordial",         description: "Dinosaurios; temperatura alta; relojes 10% más lentos (39-49)." } } },
  { id: "lava_sea",          name: "Lava Sea",                 primary_color_hex: "#BF360C", secondary_color_hex: null,      description: "Obsidian islands over magma; ambient damage (30-38).",                               sort_order: 6, i18n: { es: { name: "Mar de Lava",               description: "Islas de obsidiana sobre magma; daño ambiental (30-38)." } } },
  { id: "crystal_void",      name: "Crystal Void",             primary_color_hex: "#00ACC1", secondary_color_hex: null,      description: "Unstable gravity; cosmic entities (20-29).",                                         sort_order: 7, i18n: { es: { name: "Vacío Cristalino",          description: "Gravedad inestable; entidades cósmicas (20-29)." } } },
  { id: "demonic_abyss",     name: "Demonic Abyss",            primary_color_hex: "#B71C1C", secondary_color_hex: null,      description: "True demons; the map shifts between days (10-19).",                                  sort_order: 8, i18n: { es: { name: "Abismo Demoníaco",          description: "Demonios reales; mapa cambia entre días (10-19)." } } },
  { id: "beating_heart",     name: "Beating Heart",            primary_color_hex: "#880E4F", secondary_color_hex: null,      description: "The walls beat like a heart; Cerberus guards (2-9).",                                sort_order: 9, i18n: { es: { name: "Corazón Palpitante",        description: "Las paredes laten como un corazón; Cerbero guarda (2-9)." } } },
  { id: "architect_chamber", name: "Architect's Chamber",      primary_color_hex: "#FFEBEE", secondary_color_hex: null,      description: "Perfectly square chamber on Floor 1; boss = conversation.",                          sort_order: 10, i18n: { es: { name: "Sala del Arquitecto",       description: "Sala perfectamente cuadrada del piso 1; boss = conversación." } } },
] as const;

// Floor data: { number, en_name, es_name, biome_id, season, is_hub, is_boss }
const floorData: Array<[number, string, string, string, 1 | 2 | 3, boolean, boolean]> = [
  [100, "The Crossing",                "El Umbral (The Crossing)",        "threshold",         1, true,  false],
  [99,  "Threshold Shadows",            "Las Sombras del Umbral",          "threshold",         1, false, false],
  [98,  "The Forgotten Path",           "El Sendero Olvidado",             "threshold",         1, false, false],
  [97,  "Gallery of the Fallen",        "Galería de los Caídos",           "threshold",         1, false, false],
  [96,  "The First Catacombs",          "Las Catacumbas Iniciales",        "threshold",         1, false, false],
  [95,  "The First Trial",              "El Primer Desafío",               "threshold",         1, false, true ],
  [94,  "Ruins of the First Era",       "Las Ruinas de la Primera Era",    "first_era_ruins",   1, false, false],
  [93,  "The Sealed Passage",           "El Pasadizo Sellado",             "first_era_ruins",   1, false, false],
  [92,  "Narrow Tunnels",               "Los Túneles Estrechos",           "first_era_ruins",   1, false, false],
  [91,  "Frontier of Knowledge",        "La Frontera del Conocimiento",    "first_era_ruins",   1, false, false],
  [90,  "Memoria",                      "Memoria",                          "first_era_ruins",   1, true,  true ],
  [89,  "Stagnant Waters",              "Las Aguas Estancadas",            "khaos_catacombs",   1, false, false],
  [88,  "The Butcher",                  "El Carnicero",                     "khaos_catacombs",   1, false, false],
  [87,  "Broken Corridors",             "Los Pasillos Rotos",              "khaos_catacombs",   1, false, false],
  [86,  "Echo of the Mage",             "El Eco del Mago",                 "khaos_catacombs",   1, false, false],
  [85,  "Trial of Darkness",            "El Desafío de la Oscuridad",      "khaos_catacombs",   1, true,  true ],
  [84,  "Deep Black Waters",            "Las Aguas Negras Profundas",      "khaos_catacombs",   1, false, false],
  [83,  "Forgotten Cemeteries",         "Los Cementerios Olvidados",       "khaos_catacombs",   1, false, false],
  [82,  "Iron Knuckle's Hall",          "La Sala del Iron Knuckle",        "khaos_catacombs",   1, false, false],
  [81,  "Forest Threshold",             "El Umbral del Bosque",             "khaos_catacombs",   1, false, false],
  [80,  "Reptite Invasion",             "La Invasión de los Reptites",     "khaos_catacombs",   1, false, true ],
  [79,  "Echo Shadows",                 "Las Sombras del Eco",             "khaos_catacombs",   1, false, false],
  [78,  "Khaos Dreams",                 "Los Sueños del Khaos",            "khaos_catacombs",   1, false, false],
  [77,  "The Crossed Front",            "El Frente Cruzado",                "khaos_catacombs",   1, false, false],
  [76,  "Forger's Caves",               "Las Cuevas del Forjador",         "khaos_catacombs",   1, false, false],
  [75,  "Front Line",                   "La Línea del Frente",             "khaos_catacombs",   1, false, true ],
  [74,  "The Forgotten Path",           "El Camino Olvidado",              "khaos_catacombs",   1, false, false],
  [73,  "Deep Shadows",                 "Las Sombras Profundas",            "khaos_catacombs",   1, false, false],
  [72,  "Final Front Line",             "La Línea del Frente Final",       "khaos_catacombs",   1, false, false],
  [71,  "The Primordial Sentinel",      "El Centinela Primordial",          "khaos_catacombs",   1, false, true ],
  // Season 2 (70-41) — only canonical names; Piso N for the rest
  [70,  "Floor 70",                     "Piso 70",                          "abyssal_forest",    2, false, false],
  [69,  "Floor 69",                     "Piso 69",                          "abyssal_forest",    2, false, false],
  [68,  "Floor 68",                     "Piso 68",                          "abyssal_forest",    2, false, false],
  [67,  "Floor 67",                     "Piso 67",                          "abyssal_forest",    2, false, false],
  [66,  "Floor 66",                     "Piso 66",                          "abyssal_forest",    2, false, false],
  [65,  "The Crypt",                    "La Cripta",                        "abyssal_forest",    2, true,  false],
  [64,  "Floor 64",                     "Piso 64",                          "abyssal_forest",    2, false, false],
  [63,  "Floor 63",                     "Piso 63",                          "abyssal_forest",    2, false, false],
  [62,  "Floor 62",                     "Piso 62",                          "abyssal_forest",    2, false, false],
  [61,  "Floor 61",                     "Piso 61",                          "abyssal_forest",    2, false, false],
  [60,  "Hidden City of the Deep Ones", "Ciudad Oculta de los Profundos",  "abyssal_forest",    2, true,  false],
  [59,  "Floor 59",                     "Piso 59",                          "abyssal_forest",    2, false, false],
  [58,  "Floor 58",                     "Piso 58",                          "abyssal_forest",    2, false, false],
  [57,  "Floor 57",                     "Piso 57",                          "abyssal_forest",    2, false, false],
  [56,  "Floor 56",                     "Piso 56",                          "abyssal_forest",    2, false, false],
  [55,  "The Corrupted Druid",          "El Druida Corrompido",            "abyssal_forest",    2, false, true ],
  [54,  "Floor 54",                     "Piso 54",                          "abyssal_forest",    2, false, false],
  [53,  "Floor 53",                     "Piso 53",                          "abyssal_forest",    2, false, false],
  [52,  "Floor 52",                     "Piso 52",                          "abyssal_forest",    2, false, false],
  [51,  "Floor 51",                     "Piso 51",                          "abyssal_forest",    2, false, false],
  [50,  "Floor 50",                     "Piso 50",                          "abyssal_forest",    2, false, false],
  [49,  "Floor 49",                     "Piso 49",                          "primordial_jungle", 2, false, false],
  [48,  "Floor 48",                     "Piso 48",                          "primordial_jungle", 2, false, false],
  [47,  "Floor 47",                     "Piso 47",                          "primordial_jungle", 2, false, false],
  [46,  "Floor 46",                     "Piso 46",                          "primordial_jungle", 2, false, false],
  [45,  "Floor 45",                     "Piso 45",                          "primordial_jungle", 2, false, false],
  [44,  "Floor 44",                     "Piso 44",                          "primordial_jungle", 2, false, false],
  [43,  "Floor 43",                     "Piso 43",                          "primordial_jungle", 2, false, false],
  [42,  "Floor 42",                     "Piso 42",                          "primordial_jungle", 2, false, false],
  [41,  "Rex of the Abyss",             "Rex del Abismo",                   "primordial_jungle", 2, false, true ],
  // Season 3 (40-1)
  [40,  "Floor 40",                     "Piso 40",                          "primordial_jungle", 3, false, false],
  [39,  "Floor 39",                     "Piso 39",                          "primordial_jungle", 3, false, false],
  [38,  "Ignium",                       "Ignium",                            "lava_sea",          3, true,  false],
  [37,  "Floor 37",                     "Piso 37",                          "lava_sea",          3, false, false],
  [36,  "Floor 36",                     "Piso 36",                          "lava_sea",          3, false, false],
  [35,  "Floor 35",                     "Piso 35",                          "lava_sea",          3, false, false],
  [34,  "Floor 34",                     "Piso 34",                          "lava_sea",          3, false, false],
  [33,  "Floor 33",                     "Piso 33",                          "lava_sea",          3, false, false],
  [32,  "Floor 32",                     "Piso 32",                          "lava_sea",          3, false, false],
  [31,  "Floor 31",                     "Piso 31",                          "lava_sea",          3, false, false],
  [30,  "Floor 30",                     "Piso 30",                          "lava_sea",          3, false, false],
  [29,  "Floor 29",                     "Piso 29",                          "crystal_void",      3, false, false],
  [28,  "Floor 28",                     "Piso 28",                          "crystal_void",      3, false, false],
  [27,  "Floor 27",                     "Piso 27",                          "crystal_void",      3, false, false],
  [26,  "Floor 26",                     "Piso 26",                          "crystal_void",      3, false, false],
  [25,  "Floor 25",                     "Piso 25",                          "crystal_void",      3, false, false],
  [24,  "Floor 24",                     "Piso 24",                          "crystal_void",      3, false, false],
  [23,  "Floor 23",                     "Piso 23",                          "crystal_void",      3, false, false],
  [22,  "Floor 22",                     "Piso 22",                          "crystal_void",      3, false, false],
  [21,  "Floor 21",                     "Piso 21",                          "crystal_void",      3, false, false],
  [20,  "The Eye of the Void",          "El Ojo del Vacío",                 "crystal_void",      3, false, true ],
  [19,  "Floor 19",                     "Piso 19",                          "demonic_abyss",     3, false, false],
  [18,  "Floor 18",                     "Piso 18",                          "demonic_abyss",     3, false, false],
  [17,  "Floor 17",                     "Piso 17",                          "demonic_abyss",     3, false, false],
  [16,  "Floor 16",                     "Piso 16",                          "demonic_abyss",     3, false, false],
  [15,  "Erastos, Demon of Judgment",   "Demonio del Juicio Erastos",       "demonic_abyss",     3, false, true ],
  [14,  "Floor 14",                     "Piso 14",                          "demonic_abyss",     3, false, false],
  [13,  "Floor 13",                     "Piso 13",                          "demonic_abyss",     3, false, false],
  [12,  "Floor 12",                     "Piso 12",                          "demonic_abyss",     3, false, false],
  [11,  "Floor 11",                     "Piso 11",                          "demonic_abyss",     3, false, false],
  [10,  "Floor 10",                     "Piso 10",                          "demonic_abyss",     3, false, false],
  [9,   "Floor 9",                      "Piso 9",                           "beating_heart",     3, false, false],
  [8,   "Floor 8",                      "Piso 8",                           "beating_heart",     3, false, false],
  [7,   "Floor 7",                      "Piso 7",                           "beating_heart",     3, false, false],
  [6,   "Floor 6",                      "Piso 6",                           "beating_heart",     3, false, false],
  [5,   "Hemorrhax (World Boss)",       "Hemorrhax (World Boss)",           "beating_heart",     3, false, true ],
  [4,   "Floor 4",                      "Piso 4",                           "beating_heart",     3, false, false],
  [3,   "Floor 3",                      "Piso 3",                           "beating_heart",     3, false, false],
  [2,   "Cerberus of the Threshold",    "Cerbero del Umbral",               "beating_heart",     3, false, true ],
  [1,   "The Architect's Chamber",      "La Sala del Arquitecto",           "architect_chamber", 3, true,  true ],
];

const floors = floorData.map(([n, en, es, biome, season, hub, boss]) => ({
  floor_number: n,
  name: en,
  biome_id: biome,
  season,
  is_hub: hub,
  is_boss_floor: boss,
  // EXP modifier compounds 1.05× per floor BELOW 100. Floor 100 = 1.0.
  exp_modifier: Number(Math.pow(1.05, 100 - n).toFixed(3)),
  i18n: { es: { name: es } },
}));

const cities = [
  { id: "the_crossing",      name: "The Crossing",                main_floor: 100, floor_range_min: 100, floor_range_max: 100, sort_order: 1, description: "Main hub · character creation · first commerce.",                                       i18n: { es: { description: "Hub principal · creación de personaje · primer comercio." } } },
  { id: "memoria",           name: "Memoria",                      main_floor: 90,  floor_range_min: 85,  floor_range_max: 90,  sort_order: 2, description: "The Blind Archivist's hidden city (requires 3 fragments).",                              i18n: { es: { description: "Ciudad oculta de la Archivista (requiere 3 fragmentos)." } } },
  { id: "the_crypt",         name: "The Crypt",                    main_floor: 65,  floor_range_min: 65,  floor_range_max: 79,  sort_order: 3, description: "Soul Merchant · operated by intelligent undead.",                                        i18n: { es: { description: "Mercader de Almas · operada por no-muertos inteligentes." } } },
  { id: "ignium",            name: "Ignium",                       main_floor: 38,  floor_range_min: 30,  floor_range_max: 38,  sort_order: 4, description: "Legendary forges · advanced alchemists · high PvP density.",                            i18n: { es: { description: "Forjas legendarias · alquimistas avanzados · alta densidad PvP." } } },
  { id: "void_nodes",        name: "Void Nodes",                   main_floor: 25,  floor_range_min: 20,  floor_range_max: 29,  sort_order: 5, description: "Temporary refuges (3-5 safe nodes, no real city).",                                       i18n: { es: { name: "Nodos del Vacío", description: "Refugios temporales (3-5 nodos seguros, sin ciudad real)." } } },
] as const;

export async function seedWorld(client: SupabaseClient): Promise<SeedReport[]> {
  const reports: SeedReport[] = [];
  reports.push(await upsertWithI18n(client, "biomes", "biome", biomes as readonly { id: string; i18n?: RecordTranslations }[]));

  // Floors use floor_number as PK, not id. Use a different upsert path.
  const floorsCanonical = floors.map(({ i18n: _i18n, ...rest }) => rest);
  const { error: floorsErr } = await client
    .from("floors")
    .upsert(floorsCanonical, { onConflict: "floor_number" });
  if (floorsErr) throw new Error(`upsert floors: ${floorsErr.message}`);

  const floorTranslations = floors.flatMap((f) => {
    const out: { entity_type: string; entity_id: string; locale: string; field: string; value: string }[] = [];
    if (!f.i18n) return out;
    for (const [locale, fields] of Object.entries(f.i18n)) {
      if (!fields) continue;
      for (const [field, value] of Object.entries(fields)) {
        if (value !== undefined) {
          out.push({
            entity_type: "floor",
            entity_id: String(f.floor_number),
            locale,
            field,
            value,
          });
        }
      }
    }
    return out;
  });
  if (floorTranslations.length > 0) {
    const { error: tErr } = await client
      .from("translations")
      .upsert(floorTranslations, { onConflict: "entity_type,entity_id,locale,field" });
    if (tErr) throw new Error(`upsert floor translations: ${tErr.message}`);
  }
  reports.push({ table: "floors", rows: floors.length, translations: floorTranslations.length });

  reports.push(await upsertWithI18n(client, "cities", "city", cities as readonly { id: string; i18n?: RecordTranslations }[]));
  return reports;
}
