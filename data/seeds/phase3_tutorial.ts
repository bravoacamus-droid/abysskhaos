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
    name: "Cave Entrance",
    description:
      "A torchlit grotto wreathed in moss and ferns. Cedric the Broken waits by the path, watching the newcomers descend into the abyss.",
    room_type: "hub",
    is_safe: true,
    biome_id: "threshold",
    es: {
      name: "Entrada de la Cueva",
      description:
        "Una gruta iluminada cubierta de musgo y helechos. Cedric el Roto espera junto al sendero, observando a los recién llegados descender al abismo.",
    },
  },
  {
    slug: "f100_r02",
    floor_number: 100,
    room_index: 2,
    name: "The Underground River",
    description:
      "Water roars through a chasm cut by centuries. A small stone bridge spans the river, the only path forward.",
    room_type: "tutorial",
    is_safe: true,
    biome_id: "threshold",
    es: {
      name: "El Río Subterráneo",
      description:
        "El agua ruge por una grieta tallada en siglos. Un pequeño puente de piedra cruza el río, único paso hacia adelante.",
    },
  },
  {
    slug: "f100_r03",
    floor_number: 100,
    room_index: 3,
    name: "The Guardian's Chamber",
    description:
      "A vast cavern bathed in cold white light. A colossal white dragon watches in silence, and beside it a hyperdimensional portal hums with the labyrinth beyond.",
    room_type: "boss",
    is_safe: false,
    biome_id: "threshold",
    es: {
      name: "Cámara del Guardián",
      description:
        "Una vasta caverna bañada en una luz blanca fría. Un colosal dragón blanco observa en silencio, y a su lado un portal hyperdimensional vibra con el laberinto más allá.",
    },
  },
] as const;

// Linear cave tutorial: entrance ↔ river ↔ guardian. Only 3 rooms now.
type Direction = "north" | "south" | "east" | "west";
const CONNECTIONS: Array<{ fromSlug: string; toSlug: string; direction: Direction }> = [
  { fromSlug: "f100_r01", toSlug: "f100_r02", direction: "south" },
  { fromSlug: "f100_r02", toSlug: "f100_r01", direction: "north" },
  { fromSlug: "f100_r02", toSlug: "f100_r03", direction: "south" },
  { fromSlug: "f100_r03", toSlug: "f100_r02", direction: "north" },
];

// -----------------------------------------------------------------------------
// Tilemap layouts. The Phaser scene reads `tiles` as a 2D char grid and pairs
// each cell with a Wang tile from the biome tileset. `#` = wall (upper terrain)
// `.` = floor (lower terrain). `spawn` is the default position when the
// character first enters; `exits` map a connection direction to the tile cell
// the player must reach to trigger the transition.
// -----------------------------------------------------------------------------

type TilemapData = {
  width: number;
  height: number;
  tiles: string[]; // each string is one row; chars: '#' wall, '.' floor
  spawn: { x: number; y: number };
  exits: Partial<Record<Direction, { x: number; y: number }>>;
  /** Optional decorative props painted in the scene (Phase 3c+). */
  props?: Array<{ kind: string; x: number; y: number }>;
};

const TILEMAPS: Record<string, TilemapData> = {
  // Cave Entrance — open grotto where Cedric greets the player.
  // Trees flank the path; spawn near the north wall, exit south at (6,10).
  f100_r01: {
    width: 13,
    height: 11,
    tiles: [
      "#############", // north wall solid (no exit)
      "#...........#",
      "#...........#",
      "#...........#",
      "#...........#",
      "#...........#",
      "#...........#",
      "#...........#",
      "#...........#",
      "#...........#",
      "#####...#####", // exit south at (6, 10)
    ],
    spawn: { x: 6, y: 2 },
    exits: { south: { x: 6, y: 10 } },
    props: [
      { kind: "cave_tree", x: 2, y: 8 },
      { kind: "cave_tree", x: 10, y: 8 },
      // Beast-hero statues of the Labyrinth flanking Cedric at (6, 5).
      // 3x the size of Cedric, collidable, no animation.
      { kind: "centaur_hero_statue", x: 3, y: 5 },
      { kind: "lion_warrior_statue", x: 9, y: 5 },
    ],
  },
  // The Underground River — horizontal river bisects the room. The
  // single bridge tile (col 6, row 5) is the only passable cell.
  // River props are stamped on every wall tile of row 5 (except the
  // bridge col) so the player visibly sees cyan water flowing under
  // their feet as they cross.
  f100_r02: {
    width: 13,
    height: 11,
    tiles: [
      "#####...#####", // exit north
      "#...........#",
      "#...........#",
      "#...........#",
      "#...........#",
      "######.######", // river: walls except bridge at (6, 5)
      "#...........#",
      "#...........#",
      "#...........#",
      "#...........#",
      "#####...#####", // exit south
    ],
    spawn: { x: 6, y: 9 },
    exits: { north: { x: 6, y: 0 }, south: { x: 6, y: 10 } },
    props: [
      // River segments — 11 visual tiles cover cols 1–11 of row 5,
      // bridge prop sits on top of col 6.
      { kind: "cave_river", x: 1, y: 5 },
      { kind: "cave_river", x: 2, y: 5 },
      { kind: "cave_river", x: 3, y: 5 },
      { kind: "cave_river", x: 4, y: 5 },
      { kind: "cave_river", x: 5, y: 5 },
      { kind: "cave_river", x: 7, y: 5 },
      { kind: "cave_river", x: 8, y: 5 },
      { kind: "cave_river", x: 9, y: 5 },
      { kind: "cave_river", x: 10, y: 5 },
      { kind: "cave_river", x: 11, y: 5 },
      { kind: "cave_bridge_stone", x: 6, y: 5 },
      { kind: "cave_tree", x: 2, y: 2 },
      { kind: "cave_tree", x: 10, y: 8 },
    ],
  },
  // The Guardian's Chamber — boss room. The white dragon dominates the
  // top half; the hyperdimensional portal sits to its side. Only exit
  // is north (back to the river) until phase 4 wires the portal.
  f100_r03: {
    width: 13,
    height: 11,
    tiles: [
      "#####...#####", // exit north
      "#...........#",
      "#...........#",
      "#...........#", // dragon visually anchors around (6, 4)
      "#...........#",
      "#...........#",
      "#...........#",
      "#...........#", // portal sits at (9, 7)
      "#...........#",
      "#...........#",
      "#############", // south wall solid
    ],
    spawn: { x: 6, y: 9 },
    exits: { north: { x: 6, y: 0 } },
    props: [
      // Dragon is a big sprite anchored at its center tile (6,4).
      // collision=true keeps the player from walking into it.
      { kind: "cave_dragon_white", x: 6, y: 4 },
      { kind: "portal_hyperdimensional", x: 9, y: 7 },
    ],
  },
};

// -----------------------------------------------------------------------------
// NPC placements within rooms (tile coordinates).
// -----------------------------------------------------------------------------

const NPC_PLACEMENTS: Array<{ roomSlug: string; npcId: string; tileX: number; tileY: number }> = [
  // Cedric stands mid-room so the player meets him on the way south
  // toward the exit. Spawn is at (6, 2); Cedric at (6, 5) is reachable
  // in 3 steps and visible immediately.
  { roomSlug: "f100_r01", npcId: "cedric_the_broken", tileX: 6, tileY: 5 },
  // Ozyel shares the dragon prop's tile in r03 (Guardian's Chamber). He
  // has no sprite of his own — the dragon prop is his body. The NPC
  // entry exists so adjacency triggers the talk HUD and his dialogue.
  { roomSlug: "f100_r03", npcId: "ozyel_the_guardian", tileX: 6, tileY: 4 },
];

// -----------------------------------------------------------------------------
// NPC first-meet dialogues. Each entry becomes one row in npc_dialogues
// plus N rows in npc_dialogue_lines (+ ES translations).
// -----------------------------------------------------------------------------

type DialogueLineSeed = { seq: number; speaker: "narrator" | "npc" | "choice"; text: string; es: string };
type DialogueSeed = {
  npc_id: string;
  dialogue_key: string;
  is_default_first: boolean;
  lines: DialogueLineSeed[];
};

const DIALOGUES: DialogueSeed[] = [
  {
    npc_id: "cedric_the_broken",
    dialogue_key: "first_meet",
    is_default_first: true,
    lines: [
      {
        seq: 1,
        speaker: "narrator",
        text: "The man at the anvil looks up. His left arm ends at the elbow; the right is wrapped in soot-black bandages.",
        es: "El hombre del yunque alza la vista. Su brazo izquierdo termina en el codo; el derecho está envuelto en vendas negras de hollín.",
      },
      {
        seq: 2,
        speaker: "npc",
        text: "Another soul. The Architect's net is wide. They named me Cedric, when I had a body worth naming.",
        es: "Otra alma. La red del Arquitecto es ancha. Me llamaban Cedric, cuando tenía un cuerpo digno de un nombre.",
      },
      {
        seq: 3,
        speaker: "npc",
        text: "This is Floor 100 — the Threshold. The shallow end. Below it the abyss does not forgive ignorance.",
        es: "Esto es el Piso 100 — el Umbral. El extremo poco profundo. Más abajo, el abismo no perdona la ignorancia.",
      },
      {
        seq: 4,
        speaker: "npc",
        text: "Walk the corridor. Listen to what stirs. When you have seen enough, descend the spiral. I will still be here.",
        es: "Recorre el pasillo. Escucha lo que se mueve. Cuando hayas visto suficiente, baja la espiral. Yo seguiré aquí.",
      },
      {
        seq: 5,
        speaker: "narrator",
        text: "He turns back to the anvil. The hammer falls — once, twice — and a small ember lifts off the iron and dies in the air.",
        es: "Se gira de nuevo al yunque. El martillo cae — una, dos veces — y una pequeña brasa se eleva del hierro y muere en el aire.",
      },
    ],
  },
  {
    npc_id: "ozyel_the_guardian",
    dialogue_key: "first_meet",
    is_default_first: true,
    lines: [
      {
        seq: 1,
        speaker: "narrator",
        text: "The colossal white dragon stirs. Its outstretched wings hum faintly, and twin pools of cyan light open where eyes should be.",
        es: "El colosal dragón blanco se agita. Sus alas extendidas zumban levemente, y dos pozos de luz cian se abren donde deberían estar los ojos.",
      },
      {
        seq: 2,
        speaker: "npc",
        text: "I am Ozyel. I see threads, traveler — yours has not yet begun.",
        es: "Soy Ozyel. Veo hilos, viajero — el tuyo aún no ha comenzado.",
      },
      {
        seq: 3,
        speaker: "npc",
        text: "Beyond the portal sleeps the Labyrinth. Its halls drink memory and return only what they choose.",
        es: "Más allá del portal duerme el Laberinto. Sus pasillos beben memoria y devuelven solo lo que escogen.",
      },
      {
        seq: 4,
        speaker: "npc",
        text: "You will descend. You will be tested. And what walks out will not be exactly what walked in.",
        es: "Descenderás. Serás probado. Y lo que salga no será exactamente lo que entró.",
      },
      {
        seq: 5,
        speaker: "npc",
        text: "When the maze releases you, find me again. There are things only the broken can teach.",
        es: "Cuando el laberinto te libere, vuelve a buscarme. Hay cosas que solo los rotos pueden enseñar.",
      },
      {
        seq: 6,
        speaker: "narrator",
        text: "Ozyel closes its eyes. The portal beside it pulses, eager, hungry. Step in when you are ready.",
        es: "Ozyel cierra los ojos. El portal a su lado palpita, ansioso, hambriento. Cruza cuando estés listo.",
      },
    ],
  },
];

// -----------------------------------------------------------------------------
// Seed runner — idempotent.
// -----------------------------------------------------------------------------

export async function seedPhase3Tutorial(client: SupabaseClient): Promise<SeedReport[]> {
  const reports: SeedReport[] = [];

  // 0. Clean up obsolete tutorial rooms beyond the new 3-room cave layout.
  // Earlier iterations of the tutorial used 5 rooms; the cave redesign
  // cuts that to 3. Any room_index >= 4 on floor 100 is orphaned and
  // would leave dead `room_connections` and stranded characters that
  // happen to be parked there.
  const { data: obsolete } = await client
    .from("rooms")
    .select("id, room_index")
    .eq("floor_number", 100)
    .gte("room_index", 4)
    .is("character_id", null);
  if (obsolete && obsolete.length > 0) {
    const obsoleteIds = obsolete.map((r) => r.id as string);
    // Bring any stranded characters back to the cave entrance so they
    // don't end up pointing at a deleted room id.
    await client
      .from("characters")
      .update({ current_room_id: null })
      .in("current_room_id", obsoleteIds);
    // FK chains: connections + room_npcs + character_room_visits all
    // reference rooms.id, so clear them before deleting the rooms.
    await client.from("room_connections").delete().in("from_room_id", obsoleteIds);
    await client.from("room_connections").delete().in("to_room_id", obsoleteIds);
    await client.from("room_npcs").delete().in("room_id", obsoleteIds);
    await client.from("character_room_visits").delete().in("room_id", obsoleteIds);
    await client.from("rooms").delete().in("id", obsoleteIds);
  }
  // Also wipe any room_connections whose direction no longer matches the
  // new linear layout. The upsert below only adds the canonical 4 edges
  // (r01↔r02, r02↔r03); a phantom connection from an earlier seed would
  // sit alongside it otherwise.
  // We delete-then-reinsert connections for the 3 surviving rooms.

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
    const tilemap = TILEMAPS[r.slug] ?? null;
    if (existing) {
      const { error: updErr } = await client
        .from("rooms")
        .update({
          name: r.name,
          description: r.description,
          room_type: r.room_type,
          is_safe: r.is_safe,
          biome_id: r.biome_id,
          tilemap_data: tilemap,
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
          tilemap_data: tilemap,
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

  // 2. Connections. Delete then re-insert all connections rooted in the
  // surviving 3 rooms — that wipes any phantom rows from earlier seeds
  // (e.g. an east/west exit that no longer makes sense in the cave
  // layout) which would otherwise sit alongside the canonical ones.
  const survivingRoomIds = Array.from(slugToId.values());
  await client.from("room_connections").delete().in("from_room_id", survivingRoomIds);
  const connectionRows = CONNECTIONS.map((c) => ({
    from_room_id: slugToId.get(c.fromSlug)!,
    direction: c.direction,
    to_room_id: slugToId.get(c.toSlug)!,
    is_locked: false,
  }));
  const { error: connErr } = await client.from("room_connections").insert(connectionRows);
  if (connErr) throw new Error(`insert room_connections: ${connErr.message}`);
  reports.push({ table: "room_connections", rows: connectionRows.length, translations: 0 });

  // 3. NPC placements (Cedric in room 1 with tile coordinates).
  const npcRows = NPC_PLACEMENTS.map((p) => ({
    room_id: slugToId.get(p.roomSlug)!,
    npc_id: p.npcId,
    tile_x: p.tileX,
    tile_y: p.tileY,
  }));
  const { error: rnErr } = await client
    .from("room_npcs")
    .upsert(npcRows, { onConflict: "room_id,npc_id" });
  if (rnErr) throw new Error(`upsert room_npcs: ${rnErr.message}`);
  reports.push({ table: "room_npcs", rows: npcRows.length, translations: 0 });

  // 4. Dialogues (npc_dialogues + npc_dialogue_lines + ES translations).
  // Each DIALOGUES entry: upsert the dialogue row, replace its lines,
  // refresh ES translations. Lines are delete-then-insert because their
  // ids depend on insertion order and changing the count/order shouldn't
  // leave dangling rows.
  let dialoguesUpserted = 0;
  let linesInserted = 0;
  let lineTranslationsInserted = 0;
  for (const dlg of DIALOGUES) {
    const { data: existingDlg, error: dlgSelErr } = await client
      .from("npc_dialogues")
      .select("id")
      .eq("npc_id", dlg.npc_id)
      .eq("dialogue_key", dlg.dialogue_key)
      .maybeSingle();
    if (dlgSelErr) throw new Error(`select npc_dialogues: ${dlgSelErr.message}`);

    let dialogueId: string;
    if (existingDlg) {
      dialogueId = existingDlg.id as string;
    } else {
      const { data: insDlg, error: insDlgErr } = await client
        .from("npc_dialogues")
        .insert({
          npc_id: dlg.npc_id,
          dialogue_key: dlg.dialogue_key,
          is_default_first: dlg.is_default_first,
        })
        .select("id")
        .single();
      if (insDlgErr) throw new Error(`insert npc_dialogues: ${insDlgErr.message}`);
      dialogueId = (insDlg as { id: string }).id;
    }
    dialoguesUpserted += 1;

    const { error: delLinesErr } = await client
      .from("npc_dialogue_lines")
      .delete()
      .eq("dialogue_id", dialogueId);
    if (delLinesErr) throw new Error(`delete npc_dialogue_lines: ${delLinesErr.message}`);

    const lineRows = dlg.lines.map((l) => ({
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
    linesInserted += lineRows.length;
    const seqToId = new Map<number, string>();
    for (const row of (insLines ?? []) as { id: string; sequence_index: number }[]) {
      seqToId.set(row.sequence_index, row.id);
    }

    const lineTranslations: TranslationRow[] = [];
    for (const l of dlg.lines) {
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
      lineTranslationsInserted += lineTranslations.length;
    }
  }
  reports.push({ table: "npc_dialogues", rows: dialoguesUpserted, translations: 0 });
  reports.push({
    table: "npc_dialogue_lines",
    rows: linesInserted,
    translations: lineTranslationsInserted,
  });

  return reports;
}
