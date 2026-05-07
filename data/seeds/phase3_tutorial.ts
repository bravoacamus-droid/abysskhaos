/**
 * Phase 3a: hand-designed 5-room tutorial layout for floor 100 (The Threshold)
 * + Cedric in room 1 with first-meet dialogue.
 *
 * Shared rooms (character_id IS NULL) so all players walk the same tutorial.
 * Personal procedural rooms start at floor 99 (Phase 4).
 *
 * Names + descriptions are canonical English in the table columns; Spanish
 * translations are inserted into `translations` keyed by entity_type='room'.
 * Cedric's dialogue lines work the same way (entity_type='npc_dialogue_line').
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SeedReport, TranslationRow } from "./_types";

// -----------------------------------------------------------------------------
// Rooms — fixed slugs for stable references across seed re-runs.
// -----------------------------------------------------------------------------

const ROOMS = [
  {
    slug: "f100_r01",
    floor_number: 100,
    room_index: 1,
    name: "The Crossing",
    description:
      "A circular hall of black stone, lit by violet bioluminescent veins running through the floor. Cedric the Broken stands by an iron anvil, watching newcomers.",
    room_type: "hub",
    is_safe: true,
    biome_id: "threshold",
    es: {
      name: "El Umbral",
      description:
        "Salón circular de piedra negra, iluminado por venas bioluminiscentes violetas que recorren el suelo. Cedric el Roto vigila junto a un yunque de hierro a los recién llegados.",
    },
  },
  {
    slug: "f100_r02",
    floor_number: 100,
    room_index: 2,
    name: "The Awakening",
    description:
      "A narrow corridor where the bioluminescence dies. The walls hum faintly, as if the abyss itself were breathing.",
    room_type: "tutorial",
    is_safe: true,
    biome_id: "threshold",
    es: {
      name: "El Despertar",
      description:
        "Un pasillo estrecho donde la bioluminiscencia se apaga. Las paredes vibran levemente, como si el abismo respirara.",
    },
  },
  {
    slug: "f100_r03",
    floor_number: 100,
    room_index: 3,
    name: "First Encounter",
    description:
      "A jagged chamber with broken pillars. A faint clicking echoes from the dark — something small, watching, deciding.",
    room_type: "mob",
    is_safe: false,
    biome_id: "threshold",
    es: {
      name: "Primer Encuentro",
      description:
        "Cámara dentada con pilares rotos. Un clic apagado resuena desde la oscuridad — algo pequeño, observando, decidiendo.",
    },
  },
  {
    slug: "f100_r04",
    floor_number: 100,
    room_index: 4,
    name: "The Cracked Steps",
    description:
      "A landing of cracked obsidian steps. A weather-beaten chest sits half-buried in dust against the eastern wall.",
    room_type: "item",
    is_safe: true,
    biome_id: "threshold",
    es: {
      name: "Los Peldaños Rotos",
      description:
        "Un descanso de peldaños de obsidiana resquebrajada. Un baúl curtido por los años yace medio enterrado en polvo contra la pared este.",
    },
  },
  {
    slug: "f100_r05",
    floor_number: 100,
    room_index: 5,
    name: "Threshold's Edge",
    description:
      "The end of Floor 100. A spiral stair plummets into darkness below. The air grows colder. This is where the descent truly begins.",
    room_type: "exit",
    is_safe: true,
    biome_id: "threshold",
    es: {
      name: "Borde del Umbral",
      description:
        "El final del Piso 100. Una escalera en espiral cae hacia la oscuridad. El aire enfría. Aquí comienza el descenso de verdad.",
    },
  },
] as const;

// Linear connections 1↔2↔3↔4↔5 for the tutorial.
type Direction = "north" | "south" | "east" | "west";
const CONNECTIONS: Array<{ fromSlug: string; toSlug: string; direction: Direction }> = [
  { fromSlug: "f100_r01", toSlug: "f100_r02", direction: "north" },
  { fromSlug: "f100_r02", toSlug: "f100_r01", direction: "south" },
  { fromSlug: "f100_r02", toSlug: "f100_r03", direction: "north" },
  { fromSlug: "f100_r03", toSlug: "f100_r02", direction: "south" },
  { fromSlug: "f100_r03", toSlug: "f100_r04", direction: "east" },
  { fromSlug: "f100_r04", toSlug: "f100_r03", direction: "west" },
  { fromSlug: "f100_r04", toSlug: "f100_r05", direction: "north" },
  { fromSlug: "f100_r05", toSlug: "f100_r04", direction: "south" },
];

// -----------------------------------------------------------------------------
// Cedric's first-meet dialogue.
// -----------------------------------------------------------------------------

const CEDRIC_FIRST_MEET = {
  npc_id: "cedric_the_broken",
  dialogue_key: "first_meet",
  is_default_first: true,
  lines: [
    {
      seq: 1,
      speaker: "narrator" as const,
      text: "The man at the anvil looks up. His left arm ends at the elbow; the right is wrapped in soot-black bandages.",
      es: "El hombre del yunque alza la vista. Su brazo izquierdo termina en el codo; el derecho está envuelto en vendas negras de hollín.",
    },
    {
      seq: 2,
      speaker: "npc" as const,
      text: "Another soul. The Architect's net is wide. They named me Cedric, when I had a body worth naming.",
      es: "Otra alma. La red del Arquitecto es ancha. Me llamaban Cedric, cuando tenía un cuerpo digno de un nombre.",
    },
    {
      seq: 3,
      speaker: "npc" as const,
      text: "This is Floor 100 — the Threshold. The shallow end. Below it the abyss does not forgive ignorance.",
      es: "Esto es el Piso 100 — el Umbral. El extremo poco profundo. Más abajo, el abismo no perdona la ignorancia.",
    },
    {
      seq: 4,
      speaker: "npc" as const,
      text: "Walk the corridor. Listen to what stirs. When you have seen enough, descend the spiral. I will still be here.",
      es: "Recorre el pasillo. Escucha lo que se mueve. Cuando hayas visto suficiente, baja la espiral. Yo seguiré aquí.",
    },
    {
      seq: 5,
      speaker: "narrator" as const,
      text: "He turns back to the anvil. The hammer falls — once, twice — and a small ember lifts off the iron and dies in the air.",
      es: "Se gira de nuevo al yunque. El martillo cae — una, dos veces — y una pequeña brasa se eleva del hierro y muere en el aire.",
    },
  ],
};

// -----------------------------------------------------------------------------
// Seed runner — idempotent.
// -----------------------------------------------------------------------------

export async function seedPhase3Tutorial(client: SupabaseClient): Promise<SeedReport[]> {
  const reports: SeedReport[] = [];

  // 1. Upsert rooms (shared = character_id NULL). Use (floor_number, room_index)
  // as logical key for the upsert; we read existing rows by that pair.
  type RoomRow = { id: string; floor_number: number; room_index: number };
  const slugToId = new Map<string, string>();

  // First pass: insert any missing rooms. We can't use a simple upsert on the
  // slug because slug isn't a column — the partial unique index keys on
  // (floor_number, room_index) where character_id IS NULL.
  for (const r of ROOMS) {
    const { data: existing, error: selErr } = await client
      .from("rooms")
      .select("id")
      .eq("floor_number", r.floor_number)
      .eq("room_index", r.room_index)
      .is("character_id", null)
      .maybeSingle();
    if (selErr) throw new Error(`select rooms: ${selErr.message}`);

    let roomId: string;
    if (existing) {
      const { error: updErr } = await client
        .from("rooms")
        .update({
          name: r.name,
          description: r.description,
          room_type: r.room_type,
          is_safe: r.is_safe,
          biome_id: r.biome_id,
        })
        .eq("id", existing.id);
      if (updErr) throw new Error(`update rooms: ${updErr.message}`);
      roomId = existing.id as string;
    } else {
      const { data: inserted, error: insErr } = await client
        .from("rooms")
        .insert({
          floor_number: r.floor_number,
          room_index: r.room_index,
          name: r.name,
          description: r.description,
          room_type: r.room_type,
          is_safe: r.is_safe,
          biome_id: r.biome_id,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(`insert rooms: ${insErr.message}`);
      roomId = (inserted as RoomRow).id;
    }
    slugToId.set(r.slug, roomId);
  }

  const roomTranslations: TranslationRow[] = [];
  for (const r of ROOMS) {
    const id = slugToId.get(r.slug)!;
    roomTranslations.push(
      { entity_type: "room", entity_id: id, locale: "es", field: "name", value: r.es.name },
      { entity_type: "room", entity_id: id, locale: "es", field: "description", value: r.es.description },
    );
  }
  if (roomTranslations.length > 0) {
    const { error: tErr } = await client
      .from("translations")
      .upsert(roomTranslations, { onConflict: "entity_type,entity_id,locale,field" });
    if (tErr) throw new Error(`upsert room translations: ${tErr.message}`);
  }
  reports.push({ table: "rooms", rows: ROOMS.length, translations: roomTranslations.length });

  // 2. Connections.
  const connectionRows = CONNECTIONS.map((c) => ({
    from_room_id: slugToId.get(c.fromSlug)!,
    direction: c.direction,
    to_room_id: slugToId.get(c.toSlug)!,
    is_locked: false,
  }));
  const { error: connErr } = await client
    .from("room_connections")
    .upsert(connectionRows, { onConflict: "from_room_id,direction" });
  if (connErr) throw new Error(`upsert room_connections: ${connErr.message}`);
  reports.push({ table: "room_connections", rows: connectionRows.length, translations: 0 });

  // 3. Cedric in room 1.
  const cedricRoomId = slugToId.get("f100_r01")!;
  const { error: rnErr } = await client
    .from("room_npcs")
    .upsert(
      [{ room_id: cedricRoomId, npc_id: "cedric_the_broken" }],
      { onConflict: "room_id,npc_id" },
    );
  if (rnErr) throw new Error(`upsert room_npcs: ${rnErr.message}`);
  reports.push({ table: "room_npcs", rows: 1, translations: 0 });

  // 4. Dialogue (npc_dialogues + npc_dialogue_lines + ES translations).
  const { data: existingDlg, error: dlgSelErr } = await client
    .from("npc_dialogues")
    .select("id")
    .eq("npc_id", CEDRIC_FIRST_MEET.npc_id)
    .eq("dialogue_key", CEDRIC_FIRST_MEET.dialogue_key)
    .maybeSingle();
  if (dlgSelErr) throw new Error(`select npc_dialogues: ${dlgSelErr.message}`);

  let dialogueId: string;
  if (existingDlg) {
    dialogueId = existingDlg.id as string;
  } else {
    const { data: insDlg, error: insDlgErr } = await client
      .from("npc_dialogues")
      .insert({
        npc_id: CEDRIC_FIRST_MEET.npc_id,
        dialogue_key: CEDRIC_FIRST_MEET.dialogue_key,
        is_default_first: CEDRIC_FIRST_MEET.is_default_first,
      })
      .select("id")
      .single();
    if (insDlgErr) throw new Error(`insert npc_dialogues: ${insDlgErr.message}`);
    dialogueId = (insDlg as { id: string }).id;
  }
  reports.push({ table: "npc_dialogues", rows: 1, translations: 0 });

  // For lines, replace-all is the simplest stable behaviour (we re-insert
  // the canonical sequence and re-key translations). Delete then insert.
  const { error: delLinesErr } = await client
    .from("npc_dialogue_lines")
    .delete()
    .eq("dialogue_id", dialogueId);
  if (delLinesErr) throw new Error(`delete npc_dialogue_lines: ${delLinesErr.message}`);

  const lineRows = CEDRIC_FIRST_MEET.lines.map((l) => ({
    dialogue_id: dialogueId,
    sequence_index: l.seq,
    speaker: l.speaker,
    text: l.text,
  }));
  const { data: insLines, error: insLinesErr } = await client
    .from("npc_dialogue_lines")
    .insert(lineRows)
    .select("id, sequence_index");
  if (insLinesErr) throw new Error(`insert npc_dialogue_lines: ${insLinesErr.message}`);
  const seqToId = new Map<number, string>();
  for (const row of (insLines ?? []) as { id: string; sequence_index: number }[]) {
    seqToId.set(row.sequence_index, row.id);
  }

  const lineTranslations: TranslationRow[] = [];
  for (const l of CEDRIC_FIRST_MEET.lines) {
    const id = seqToId.get(l.seq);
    if (!id) continue;
    lineTranslations.push({
      entity_type: "npc_dialogue_line",
      entity_id: id,
      locale: "es",
      field: "text",
      value: l.es,
    });
  }
  if (lineTranslations.length > 0) {
    const { error: ltErr } = await client
      .from("translations")
      .upsert(lineTranslations, { onConflict: "entity_type,entity_id,locale,field" });
    if (ltErr) throw new Error(`upsert dialogue translations: ${ltErr.message}`);
  }
  reports.push({
    table: "npc_dialogue_lines",
    rows: lineRows.length,
    translations: lineTranslations.length,
  });

  return reports;
}
