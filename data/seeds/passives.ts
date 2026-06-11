/**
 * The 12 "pasivas del renacido" catalog (docs/DESTINY_ENGINE.md §9). The
 * mechanical numbers (effect key, rank-1 / rank-10 values, sign) come from the
 * single source of truth in `data/destiny/passives.ts`; this file only adds the
 * localized display name + description so the catalog stays in sync with the
 * roll logic.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PASSIVES } from "../destiny/passives";
import type { PassiveId } from "../destiny/types";
import { upsertWithI18n, type RecordTranslations, type SeedReport } from "./_types";

type Display = { en: [string, string]; es: [string, string] };

const DISPLAY: Record<PassiveId, Display> = {
  golpe_certero: { en: ["Sure Strike", "Critical hit chance."], es: ["Golpe Certero", "Probabilidad de crítico."] },
  coraza_espiritual: { en: ["Spirit Carapace", "Reduces damage taken."], es: ["Coraza Espiritual", "Reduce el daño recibido."] },
  reflejo_renacido: { en: ["Reborn Reflex", "Chance to fully evade an attack."], es: ["Reflejo del Renacido", "Probabilidad de esquivar por completo."] },
  lazo_almas: { en: ["Soul Bond", "Boosts your companion's effectiveness."], es: ["Lazo de Almas", "Aumenta la efectividad del acompañante."] },
  fortuna_renacido: { en: ["Reborn's Fortune", "More khryn from enemies and sales."], es: ["Fortuna del Renacido", "Más khryn de enemigos y ventas."] },
  codicia_destino: { en: ["Destiny's Greed", "Higher rare-drop chance."], es: ["Codicia del Destino", "Mayor probabilidad de drop raro."] },
  forjador_innato: { en: ["Innate Forger", "Better Soul Forge and capture success."], es: ["Forjador Innato", "Mejor éxito en forja y captura."] },
  memoria_vidas: { en: ["Memory of Lives", "Extra XP gained."], es: ["Memoria de Vidas", "XP extra ganada."] },
  nucleo_elemental: { en: ["Elemental Core", "More damage with your element."], es: ["Núcleo Elemental", "Más daño con tu elemento."] },
  hambre_vital: { en: ["Vital Hunger", "Lifesteal from damage dealt."], es: ["Hambre Vital", "Roba vida del daño infligido."] },
  viajero_etereo: { en: ["Ethereal Traveler", "Better flee chance and fewer encounters."], es: ["Viajero Etéreo", "Mejor huida y menos encuentros."] },
  flujo_mana: { en: ["Mana Flow", "Reduces the MP cost of skills."], es: ["Flujo de Maná", "Reduce el costo de MP de las habilidades."] },
};

const passives = PASSIVES.map((p, i) => {
  const d = DISPLAY[p.id];
  return {
    id: p.id,
    name: d.en[0],
    description: d.en[1],
    effect: p.effect,
    value_r1: p.r1,
    value_r10: p.r10,
    sign: p.sign,
    sort_order: i + 1,
    i18n: { es: { name: d.es[0], description: d.es[1] } },
  };
});

export async function seedPassives(client: SupabaseClient): Promise<SeedReport[]> {
  return [
    await upsertWithI18n(client, "passives", "passive", passives as readonly { id: string; i18n?: RecordTranslations }[]),
  ];
}
