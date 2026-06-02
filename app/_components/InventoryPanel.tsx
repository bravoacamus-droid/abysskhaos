"use client";

import { useMemo, useState } from "react";

import { t, type Locale } from "@/lib/i18n";
import type {
  CharacterItem,
  EquippedSlot,
  ItemCatalogEntry,
  RoomState,
} from "@/lib/client/api";
import {
  AGI_ICON_URL,
  ATK_ICON_URL,
  CAT_ACCESSORY_ICON_URL,
  CAT_ARMOR_ICON_URL,
  CAT_CONSUMABLE_ICON_URL,
  CAT_WEAPON_ICON_URL,
  DEF_ICON_URL,
  HP_ICON_URL,
  INT_ICON_URL,
  KHRYN_ICON_URL,
  MP_ICON_URL,
  SPI_ICON_URL,
  STR_ICON_URL,
  categoryIconUrl,
} from "@/lib/client/icons";

const SLOT_FRAME_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/5dc89ad9a52d6e028e75b88b091981d622722265f4d8b0001b8c4a49dfc388ba.png";

const INVENTORY_TOTAL_SLOTS = 40;

type Tab = "equipo" | "inventario" | "atributos";

/** All equippable slots in the order shown to the player. */
const EQUIP_SLOTS_ORDER: EquippedSlot[] = [
  "main_hand",
  "off_hand",
  "armor_head",
  "armor_chest",
  "armor_arms",
  "armor_legs",
  "armor_feet",
  "accessory_amulet",
  "accessory_ring_1",
  "accessory_ring_2",
];

/** Item categories used by the Inventario tab filter. */
const CATEGORY_KEYS = ["all", "weapon", "armor", "accessory", "consumable", "misc"] as const;
type Category = (typeof CATEGORY_KEYS)[number];

type Props = {
  state: RoomState;
  locale: Locale;
  forced?: boolean;
  onClose: () => void;
  onEquip: (characterItemId: string, slot: EquippedSlot) => void;
  onUnequip: (characterItemId: string) => void;
  pendingItemId?: string | null;
};

export function InventoryPanel({
  state,
  locale,
  forced,
  onClose,
  onEquip,
  onUnequip,
  pendingItemId,
}: Props) {
  // During the equip_sword tutorial step we start the player on the
  // Equipo tab so the next step is obvious — they have to drop the
  // sword into main_hand.
  const initialTab: Tab = forced ? "equipo" : "inventario";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [category, setCategory] = useState<Category>("all");
  /** Which inventory item the player has tapped. Brings up the action
   *  drawer at the bottom of the inventory tab. */
  const [selectedInvId, setSelectedInvId] = useState<string | null>(null);
  /** Which equipped slot the player has tapped for swapping. Opens
   *  the slot picker overlay. */
  const [slotPickerOpen, setSlotPickerOpen] = useState<EquippedSlot | null>(null);

  const equippedBySlot = useMemo(() => {
    const map = new Map<EquippedSlot, CharacterItem>();
    for (const item of state.equipped) {
      if (typeof item.slot === "string") map.set(item.slot as EquippedSlot, item);
    }
    return map;
  }, [state.equipped]);

  const inventoryBySlot = useMemo(() => {
    const map = new Map<number, CharacterItem>();
    for (const item of state.inventory) {
      if (typeof item.slot === "number") map.set(item.slot, item);
    }
    return map;
  }, [state.inventory]);

  /** Mochila tab shows BOTH inventory + equipped items in one list,
   *  filtered by category. Equipped items get an "E" badge so the
   *  player can see what they already have on without switching tabs.
   *  Sort: equipped first, then by inventory_slot ascending. */
  const filteredInventory = useMemo(() => {
    const all = [...state.inventory, ...state.equipped];
    const items = all.filter((item) => {
      if (category === "all") return true;
      const cat = state.item_catalog[item.item_id];
      return cat?.item_type === category;
    });
    return items.sort((a, b) => {
      const aE = typeof a.slot === "string" ? 0 : 1;
      const bE = typeof b.slot === "string" ? 0 : 1;
      if (aE !== bE) return aE - bE;
      if (typeof a.slot === "number" && typeof b.slot === "number") {
        return a.slot - b.slot;
      }
      return 0;
    });
  }, [state.inventory, state.equipped, state.item_catalog, category]);

  const selectedItem =
    selectedInvId != null ? state.inventory.find((i) => i.id === selectedInvId) ?? null : null;
  const selectedCat = selectedItem ? state.item_catalog[selectedItem.item_id] : null;

  /** When the user taps an equipped slot, open a picker showing every
   *  inventory item that's compatible with that slot. */
  function compatibleInventoryFor(slot: EquippedSlot): CharacterItem[] {
    return state.inventory.filter((item) => {
      const cat = state.item_catalog[item.item_id];
      if (!cat) return false;
      return slotIsCompatible(cat, slot);
    });
  }

  function defaultSlotForItem(item: CharacterItem): EquippedSlot | null {
    const cat = state.item_catalog[item.item_id];
    if (!cat) return null;
    if (cat.item_type === "weapon" && cat.weapon) {
      if (cat.weapon.handedness === "two_handed") return "main_hand";
      if (cat.weapon.handedness === "off_hand") return "off_hand";
      return equippedBySlot.has("main_hand") && !equippedBySlot.has("off_hand")
        ? "off_hand"
        : "main_hand";
    }
    if (cat.item_type === "armor" && cat.armor) {
      const map: Record<string, EquippedSlot> = {
        head: "armor_head",
        chest: "armor_chest",
        arms: "armor_arms",
        legs: "armor_legs",
        feet: "armor_feet",
        off_hand_shield: "off_hand",
      };
      return map[cat.armor.slot] ?? null;
    }
    if (cat.item_type === "accessory" && cat.accessory) {
      if (cat.accessory.slot === "ring") {
        return equippedBySlot.has("accessory_ring_1")
          ? "accessory_ring_2"
          : "accessory_ring_1";
      }
      if (cat.accessory.slot === "amulet") return "accessory_amulet";
    }
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-abyss-void/95 backdrop-blur-sm">
      {/* HEADER ------------------------------------------------------- */}
      <header className="flex items-center justify-between border-b-2 border-abyss-soul/50 bg-gradient-to-b from-abyss-deep to-abyss-void px-3 py-2 shadow-lg">
        {!forced ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded text-xl text-abyss-fog hover:bg-abyss-coal/40 hover:text-white"
            aria-label={t(locale, "inventory.close")}
          >
            ✕
          </button>
        ) : (
          <div className="h-8 w-8" />
        )}
        <h1 className="bg-gradient-to-b from-abyss-soul via-abyss-khaos to-abyss-ember bg-clip-text text-base font-bold uppercase tracking-[0.4em] text-transparent">
          {t(locale, "inventory.title")}
        </h1>
        <div className="flex items-center gap-1.5 text-xs text-amber-300">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={KHRYN_ICON_URL}
            alt=""
            width={20}
            height={20}
            className="h-5 w-5"
            style={{ imageRendering: "pixelated" }}
          />
          <span className="font-semibold tabular-nums">{state.player.khryn}</span>
        </div>
      </header>

      {/* TABS --------------------------------------------------------- */}
      <nav className="flex border-b border-abyss-coal/80 bg-abyss-deep/80">
        <TabBtn active={tab === "equipo"} onClick={() => setTab("equipo")}>
          {t(locale, "inventory.tab_equipped")}
        </TabBtn>
        <TabBtn active={tab === "inventario"} onClick={() => setTab("inventario")}>
          {t(locale, "inventory.tab_inventory")}
        </TabBtn>
        <TabBtn active={tab === "atributos"} onClick={() => setTab("atributos")}>
          {t(locale, "inventory.tab_stats")}
        </TabBtn>
      </nav>

      {/* MAIN GRID: 2-column on portrait — left character sidebar, right tab content */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: character sidebar (always visible) ------------------- */}
        <aside className="w-[42%] max-w-[180px] shrink-0 border-r border-abyss-coal/80 bg-abyss-deep/60 p-2 overflow-y-auto">
          <CharacterCard state={state} locale={locale} />
        </aside>

        {/* RIGHT: tab content --------------------------------------- */}
        <main className="flex-1 overflow-y-auto p-3">
          {tab === "equipo" ? (
            <EquipoTab
              state={state}
              locale={locale}
              equippedBySlot={equippedBySlot}
              pendingItemId={pendingItemId ?? null}
              onUnequip={onUnequip}
              onPickSlot={(slot) => setSlotPickerOpen(slot)}
              // Tutorial step 'equip_sword' pulses main_hand so the
              // player knows where the sword needs to go.
              highlightSlot={
                state.player.tutorial_step === "equip_sword" ? "main_hand" : null
              }
            />
          ) : null}
          {tab === "inventario" ? (
            <InventarioTab
              state={state}
              locale={locale}
              filteredInventory={filteredInventory}
              category={category}
              setCategory={setCategory}
              selectedInvId={selectedInvId}
              setSelectedInvId={setSelectedInvId}
              selectedItem={selectedItem}
              selectedCat={selectedCat ?? null}
              defaultSlotForItem={defaultSlotForItem}
              onEquip={onEquip}
              pendingItemId={pendingItemId ?? null}
              inventoryBySlot={inventoryBySlot}
            />
          ) : null}
          {tab === "atributos" ? <AtributosTab state={state} locale={locale} /> : null}
        </main>
      </div>

      {/* Tutorial banner if forced equip step is active. */}
      {forced ? (
        <footer className="border-t-2 border-abyss-soul/60 bg-abyss-deep/95 px-3 py-2 text-center text-xs uppercase tracking-widest text-abyss-soul animate-pulse">
          {t(locale, "tutorial.step.equip_sword")}
        </footer>
      ) : null}

      {/* Slot picker modal (when player taps an equip slot) */}
      {slotPickerOpen ? (
        <SlotPickerModal
          slot={slotPickerOpen}
          state={state}
          locale={locale}
          items={compatibleInventoryFor(slotPickerOpen)}
          onPick={(itemId) => {
            onEquip(itemId, slotPickerOpen);
            setSlotPickerOpen(null);
          }}
          onClose={() => setSlotPickerOpen(null)}
          pendingItemId={pendingItemId ?? null}
        />
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * CHARACTER SIDEBAR — always visible on the left
 * ────────────────────────────────────────────────────────────────── */
function CharacterCard({ state, locale }: { state: RoomState; locale: Locale }) {
  const p = state.player;
  // Use the walking sprite (sprite_atlas.south) — same one the player
  // sees in-world. NEVER fall back to portrait_url here because the
  // class portrait shows the warrior holding a sword by default, which
  // misrepresents what's actually equipped right now.
  const spriteUrl = p.sprite_atlas?.south ?? null;
  // Overlay icon for the currently-equipped main-hand weapon. Floats
  // bottom-right of the sprite box like an item-tooltip pinned to the
  // character — refs (Chrono Trigger / FF VI / Octopath) don't render
  // equipped weapons on overworld sprites either, so we do this in UI
  // chrome instead. Phase 4 will move the weapon into per-class attack
  // animations during battle (see project_phase4_attack_animations).
  const mainHand = state.equipped.find((e) => e.slot === "main_hand");
  const mainHandCat = mainHand ? state.item_catalog[mainHand.item_id] : null;
  const mainHandIcon = mainHandCat?.icon_path ?? null;
  const mainHandName = mainHandCat?.name_localized ?? null;
  // Use the effective max (base + equipped bonus_hp/mp) for both the
  // bar denominator and the percentage. Equipping a +10 HP weapon now
  // bumps the bar's max instantly; hp_current isn't auto-bumped, so
  // the bar might briefly look "less full" — that's intentional, the
  // player can rest / consume to refill.
  const hpMax = p.hp_max_effective;
  const mpMax = p.mp_max_effective;
  const hpPct = hpMax > 0 ? (p.hp_current / hpMax) * 100 : 0;
  const mpPct = mpMax > 0 ? (p.mp_current / mpMax) * 100 : 0;
  return (
    <div className="space-y-2">
      {/* Sprite preview box + equipped-weapon overlay */}
      <div className="relative flex aspect-square items-center justify-center rounded border border-abyss-coal/80 bg-abyss-void">
        {spriteUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={spriteUrl}
            alt={p.name}
            className="h-full w-full object-contain p-2"
            style={{ imageRendering: "pixelated" }}
          />
        ) : (
          <span className="text-3xl text-abyss-fog">?</span>
        )}
        {mainHandIcon ? (
          // Pinned bottom-right; uses the slot frame to read as an
          // "equipped" badge rather than a stray sprite.
          <div
            className="absolute bottom-1 right-1 h-10 w-10"
            style={{
              backgroundImage: `url(${SLOT_FRAME_URL})`,
              backgroundSize: "100% 100%",
              imageRendering: "pixelated",
            }}
            title={mainHandName ?? undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mainHandIcon}
              alt={mainHandName ?? ""}
              className="absolute inset-1 h-[calc(100%-8px)] w-[calc(100%-8px)] object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        ) : null}
      </div>
      {/* Name + class */}
      <div className="text-center">
        <p className="truncate text-sm font-bold text-white">{p.name || "—"}</p>
        <p className="text-[10px] uppercase tracking-widest text-abyss-soul">
          Nv.{p.level} · {p.class_name}
        </p>
      </div>
      {/* HP / MP bars */}
      <div className="space-y-1">
        <BarLine
          icon={HP_ICON_URL}
          label="HP"
          color="bg-rose-500"
          value={p.hp_current}
          max={hpMax}
          pct={hpPct}
        />
        <BarLine
          icon={MP_ICON_URL}
          label="MP"
          color="bg-sky-400"
          value={p.mp_current}
          max={mpMax}
          pct={mpPct}
        />
      </div>
      {/* Primary attrs summary — effective (base + equipped gear) */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 rounded border border-abyss-coal/60 bg-abyss-void/50 px-2 py-1.5 text-[10px]">
        <StatLine icon={ATK_ICON_URL} label={t(locale, "stats.atk")} value={p.atk} />
        <StatLine icon={DEF_ICON_URL} label={t(locale, "stats.def")} value={p.def} />
        <StatLine icon={STR_ICON_URL} label="STR" value={p.effective_attr_strength} />
        <StatLine icon={AGI_ICON_URL} label="AGI" value={p.effective_attr_agility} />
        <StatLine icon={INT_ICON_URL} label="INT" value={p.effective_attr_intelligence} />
        <StatLine icon={SPI_ICON_URL} label="SPI" value={p.effective_attr_spirit} />
      </div>
    </div>
  );
}

function BarLine({
  icon,
  label,
  color,
  value,
  max,
  pct,
}: {
  icon?: string;
  label: string;
  color: string;
  value: number;
  max: number;
  pct: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-1 text-[9px] uppercase tracking-widest text-abyss-fog">
        <div className="flex items-center gap-1">
          {icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={icon} alt="" width={14} height={14} className="h-3.5 w-3.5" style={{ imageRendering: "pixelated" }} />
          ) : null}
          <span>{label}</span>
        </div>
        <span className="tabular-nums text-white">
          {value}/{max}
        </span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-sm bg-abyss-void">
        <div className={`${color} h-full`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}

function StatLine({
  icon,
  label,
  value,
}: {
  icon?: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-1 text-abyss-mist">
      <div className="flex items-center gap-1">
        {icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={icon}
            alt=""
            width={12}
            height={12}
            className="h-3 w-3"
            style={{ imageRendering: "pixelated" }}
          />
        ) : null}
        <span className="uppercase tracking-widest text-abyss-fog">{label}</span>
      </div>
      <span className="tabular-nums text-white">{value}</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * EQUIPO TAB — Octopath-style vertical list of equip slots
 * ────────────────────────────────────────────────────────────────── */
function EquipoTab({
  state,
  locale,
  equippedBySlot,
  pendingItemId,
  onUnequip,
  onPickSlot,
  highlightSlot,
}: {
  state: RoomState;
  locale: Locale;
  equippedBySlot: Map<EquippedSlot, CharacterItem>;
  pendingItemId: string | null;
  onUnequip: (id: string) => void;
  onPickSlot: (slot: EquippedSlot) => void;
  /** Tutorial hint: this slot pulses so the player knows where to drop
   *  the item. Set during equip_sword tutorial step (= 'main_hand'). */
  highlightSlot?: EquippedSlot | null;
}) {
  return (
    <div className="space-y-1.5">
      {EQUIP_SLOTS_ORDER.map((slot) => {
        const item = equippedBySlot.get(slot);
        const cat = item ? state.item_catalog[item.item_id] : null;
        const isPending = !!item && pendingItemId === item.id;
        const isHighlight = highlightSlot === slot;
        return (
          <button
            key={slot}
            type="button"
            disabled={isPending}
            onClick={() => {
              if (item) {
                onUnequip(item.id);
              } else {
                onPickSlot(slot);
              }
            }}
            className={
              "flex w-full items-center gap-3 rounded border px-3 py-2 text-left transition disabled:opacity-50 " +
              (isHighlight
                ? "border-abyss-soul bg-abyss-soul/15 ring-2 ring-abyss-soul/60 animate-pulse"
                : item
                  ? "border-abyss-soul/70 bg-abyss-deep/80 hover:bg-abyss-coal/30"
                  : "border-dashed border-abyss-coal/70 bg-abyss-void/60 hover:bg-abyss-coal/20")
            }
          >
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-widest text-abyss-fog">
                {t(locale, `inventory.slot.${slot}`)}
              </p>
              <p className="truncate text-sm font-semibold text-white">
                {cat?.name_localized ?? (
                  <span className="italic text-abyss-mist">{t(locale, "inventory.empty_slot")}</span>
                )}
              </p>
              {cat?.weapon ? (
                <p className="flex items-center gap-1 text-[10px] text-abyss-soul">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ATK_ICON_URL} alt="" width={11} height={11} className="h-2.5 w-2.5" style={{ imageRendering: "pixelated" }} />
                  +{cat.weapon.base_atk}
                </p>
              ) : null}
              {cat?.armor ? (
                <p className="flex items-center gap-1 text-[10px] text-abyss-soul">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={DEF_ICON_URL} alt="" width={11} height={11} className="h-2.5 w-2.5" style={{ imageRendering: "pixelated" }} />
                  +{cat.armor.base_def}
                </p>
              ) : null}
            </div>
            <span className="text-abyss-soul">{item ? "✕" : "›"}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * INVENTARIO TAB — grid + categories + selection detail
 * ────────────────────────────────────────────────────────────────── */
function InventarioTab({
  state,
  locale,
  filteredInventory,
  category,
  setCategory,
  selectedInvId,
  setSelectedInvId,
  selectedItem,
  selectedCat,
  defaultSlotForItem,
  onEquip,
  pendingItemId,
}: {
  state: RoomState;
  locale: Locale;
  filteredInventory: CharacterItem[];
  category: Category;
  setCategory: (c: Category) => void;
  selectedInvId: string | null;
  setSelectedInvId: (id: string | null) => void;
  selectedItem: CharacterItem | null;
  selectedCat: ItemCatalogEntry | null;
  defaultSlotForItem: (item: CharacterItem) => EquippedSlot | null;
  onEquip: (itemId: string, slot: EquippedSlot) => void;
  pendingItemId: string | null;
  inventoryBySlot: Map<number, CharacterItem>;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Category filter chips */}
      <div className="mb-2 flex flex-wrap gap-1">
        {CATEGORY_KEYS.map((c) => {
          const icon =
            c === "weapon"
              ? CAT_WEAPON_ICON_URL
              : c === "armor"
                ? CAT_ARMOR_ICON_URL
                : c === "accessory"
                  ? CAT_ACCESSORY_ICON_URL
                  : c === "consumable"
                    ? CAT_CONSUMABLE_ICON_URL
                    : null;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={
                "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest " +
                (category === c
                  ? "border-abyss-soul/80 bg-abyss-soul/20 text-white"
                  : "border-abyss-coal/70 bg-abyss-void/60 text-abyss-fog hover:bg-abyss-coal/30")
              }
            >
              {icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={icon} alt="" width={14} height={14} className="h-3.5 w-3.5" style={{ imageRendering: "pixelated" }} />
              ) : null}
              {t(locale, `inventory.category.${c}`)}
            </button>
          );
        })}
      </div>

      {/* Scrollable item list. Single column with item rows so the
          slot frames remain visible even on small screens. */}
      <div className="flex-1 space-y-1 overflow-y-auto pr-1">
        {filteredInventory.length === 0 ? (
          <p className="py-8 text-center text-xs text-abyss-mist">
            {t(locale, "inventory.empty_category")}
          </p>
        ) : (
          filteredInventory.map((item) => {
            const cat = state.item_catalog[item.item_id];
            const isPending = pendingItemId === item.id;
            const isEquipped = typeof item.slot === "string";
            return (
              <button
                key={item.id}
                type="button"
                disabled={isPending}
                onClick={() => setSelectedInvId(item.id)}
                className={
                  "flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left transition disabled:opacity-50 " +
                  (isEquipped
                    ? "border-abyss-soul/80 bg-abyss-soul/10 hover:bg-abyss-soul/20"
                    : "border-abyss-coal/70 bg-abyss-deep/80 hover:bg-abyss-coal/30")
                }
              >
                <div
                  className="relative h-10 w-10 shrink-0"
                  style={{
                    backgroundImage: `url(${SLOT_FRAME_URL})`,
                    backgroundSize: "100% 100%",
                    imageRendering: "pixelated",
                  }}
                >
                  {cat?.icon_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cat.icon_path}
                      alt={cat.name_localized}
                      className="absolute inset-1 h-[calc(100%-8px)] w-[calc(100%-8px)] object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : null}
                  {isEquipped ? (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-abyss-soul text-[9px] font-bold text-abyss-void shadow">
                      E
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">
                    {cat?.name_localized ?? item.item_id}
                  </p>
                  <p className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-abyss-fog">
                    {cat ? (() => {
                      const ico = categoryIconUrl(cat.item_type);
                      return ico ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ico} alt="" width={10} height={10} className="h-2.5 w-2.5" style={{ imageRendering: "pixelated" }} />
                      ) : null;
                    })() : null}
                    {t(locale, `inventory.category.${cat?.item_type ?? "misc"}`)}
                  </p>
                </div>
                {item.quantity > 1 ? (
                  <span className="rounded bg-abyss-void/80 px-1.5 py-0.5 text-xs font-bold text-abyss-soul">
                    ×{item.quantity}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>

      {/* Full item detail modal — replaces the old bottom drawer.
          Tapping an item opens the card with all its stats + actions. */}
      {selectedItem && selectedCat ? (
        <ItemDetailModal
          item={selectedItem}
          cat={selectedCat}
          locale={locale}
          isEquipped={typeof selectedItem.slot === "string"}
          targetSlot={defaultSlotForItem(selectedItem)}
          pending={pendingItemId === selectedItem.id}
          onClose={() => setSelectedInvId(null)}
          onEquip={(slot) => {
            onEquip(selectedItem.id, slot);
            setSelectedInvId(null);
          }}
        />
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * ATRIBUTOS TAB — full stat breakdown
 *
 * Renders: combat block (HP/MP/ATK/DEF) → 4 primary attribute groups,
 * each with their 5 sub-attributes nested underneath → progression
 * block (level / exp / class / path / title).
 *
 * Sub-attribute values: server pre-multiplies primary × effect_per_point
 * and sends `derived_value`. Null derived_value means the coefficient
 * is still TBD in the seed — we render "—" rather than hiding the row,
 * so the player can see what attribute X *will* affect once balance
 * lands.
 * ────────────────────────────────────────────────────────────────── */
const ATTR_ICON: Record<string, string> = {
  strength: STR_ICON_URL,
  agility: AGI_ICON_URL,
  intelligence: INT_ICON_URL,
  spirit: SPI_ICON_URL,
};

function AtributosTab({ state, locale }: { state: RoomState; locale: Locale }) {
  const p = state.player;
  const groups = state.attributes_breakdown ?? [];
  // Per-attribute gear contribution lookup — lets each group card
  // render "13 (+1)" so the player sees what's base and what's gear.
  const bonusByAttr: Record<string, number> = {
    strength: p.equipped_bonuses.bonus_str,
    agility: p.equipped_bonuses.bonus_agi,
    intelligence: p.equipped_bonuses.bonus_int,
    spirit: p.equipped_bonuses.bonus_spi,
  };
  return (
    <div className="space-y-3">
      <Section title={t(locale, "stats.section_combat")}>
        <KV icon={HP_ICON_URL} label={t(locale, "stats.hp")} value={`${p.hp_current} / ${p.hp_max_effective}`} bonus={p.equipped_bonuses.bonus_hp} />
        <KV icon={MP_ICON_URL} label={t(locale, "stats.mp")} value={`${p.mp_current} / ${p.mp_max_effective}`} bonus={p.equipped_bonuses.bonus_mp} />
        <KV icon={ATK_ICON_URL} label={t(locale, "stats.atk")} value={p.atk}        bonus={p.equipped_bonuses.atk} />
        <KV icon={DEF_ICON_URL} label={t(locale, "stats.def")} value={p.def}        bonus={p.equipped_bonuses.def} />
      </Section>
      {groups.map((g) => (
        <AttributeGroupCard key={g.id} group={g} bonus={bonusByAttr[g.id] ?? 0} locale={locale} />
      ))}
      <Section title={t(locale, "stats.section_progress")}>
        <KV label={t(locale, "stats.level")} value={p.level} />
        <KV label={t(locale, "stats.exp")} value={p.exp.toString()} />
        <KV label={t(locale, "stats.class")} value={p.class_name} />
        {p.path_id ? <KV label={t(locale, "stats.path")} value={p.path_id} /> : null}
        {p.title_id ? <KV label={t(locale, "stats.title")} value={p.title_id} /> : null}
      </Section>
    </div>
  );
}

function AttributeGroupCard({
  group,
  bonus,
  locale,
}: {
  group: NonNullable<RoomState["attributes_breakdown"]>[number];
  /** Gear contribution to this primary attr. group.value already
   *  includes it; we show it as a tiny "(+N)" annotation so the
   *  player can see how much came from equipped items. */
  bonus: number;
  locale: Locale;
}) {
  const icon = ATTR_ICON[group.id];
  return (
    <div className="rounded border border-abyss-coal/60 bg-abyss-deep/60">
      {/* Header — primary attr name + abbrev + score */}
      <div className="flex items-center justify-between gap-2 border-b border-abyss-coal/60 px-2 py-1.5">
        <div className="flex items-center gap-2">
          {icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={icon}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5"
              style={{ imageRendering: "pixelated" }}
            />
          ) : null}
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-white">
              {group.name_localized}
            </span>
            <span className="text-[9px] uppercase tracking-widest text-abyss-fog">
              {group.abbrev}
            </span>
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          {bonus > 0 ? (
            <span className="text-[10px] font-semibold tabular-nums text-emerald-400">
              +{bonus}
            </span>
          ) : null}
          <span className="rounded bg-abyss-soul/15 px-2 py-0.5 text-base font-semibold tabular-nums text-abyss-soul">
            {group.value}
          </span>
        </div>
      </div>
      {/* Body — 5 sub-attributes as rows */}
      <div className="divide-y divide-abyss-coal/40">
        {group.sub_attributes.map((s) => (
          <SubAttrRow key={s.id} sub={s} locale={locale} />
        ))}
      </div>
    </div>
  );
}

function SubAttrRow({
  sub,
  locale,
}: {
  sub: NonNullable<RoomState["attributes_breakdown"]>[number]["sub_attributes"][number];
  locale: Locale;
}) {
  const display = formatSubAttrValue(sub.derived_value, sub.effect_unit);
  const isPending = sub.derived_value === null;
  return (
    <div className="flex items-start justify-between gap-3 px-2 py-1.5">
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-[11px] font-semibold text-white">
          {sub.name_localized}
        </span>
        {sub.description_localized ? (
          <span className="text-[9px] text-abyss-fog">
            {sub.description_localized}
          </span>
        ) : null}
      </div>
      <span
        className={
          isPending
            ? "shrink-0 text-[11px] italic text-abyss-fog/70"
            : "shrink-0 text-[12px] font-semibold tabular-nums text-abyss-soul"
        }
        title={isPending ? t(locale, "stats.subattr_pending_hint") : undefined}
      >
        {display}
      </span>
    </div>
  );
}

/** Format `derived_value` based on `effect_unit`. Returns "—" for
 *  null (coefficient not yet seeded). */
function formatSubAttrValue(value: number | null, unit: string | null): string {
  if (value === null) return "—";
  const rounded = Math.round(value * 100) / 100;
  switch (unit) {
    case "pct":
    case "pct_drop_chance":
      return `+${rounded}%`;
    case "atk_flat":
    case "def_flat":
    case "matk_flat":
    case "hp_flat":
    case "mp_flat":
      return `+${rounded}`;
    case "hp_per_turn":
    case "mp_per_turn":
      return `+${rounded}/t`;
    case "weight":
      return `+${rounded}`;
    case "turn_order":
      return `+${rounded}`;
    default:
      return `${rounded}`;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-abyss-coal/60 bg-abyss-deep/60">
      <p className="border-b border-abyss-coal/60 px-2 py-1 text-[10px] uppercase tracking-widest text-abyss-soul">
        {title}
      </p>
      <div className="space-y-0.5 p-2">{children}</div>
    </div>
  );
}

function KV({
  icon,
  label,
  value,
  bonus,
}: {
  icon?: string;
  label: string;
  value: number | string;
  /** Optional gear contribution rendered as a green "+N" before the
   *  primary value. Skipped when zero or undefined. */
  bonus?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-1.5">
        {icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={icon}
            alt=""
            width={16}
            height={16}
            className="h-4 w-4"
            style={{ imageRendering: "pixelated" }}
          />
        ) : null}
        <span className="uppercase tracking-widest text-abyss-fog">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        {bonus && bonus > 0 ? (
          <span className="text-[10px] font-semibold tabular-nums text-emerald-400">
            +{bonus}
          </span>
        ) : null}
        <span className="tabular-nums font-semibold text-white">{value}</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * SLOT PICKER MODAL — opens when tapping an empty equip slot
 * ────────────────────────────────────────────────────────────────── */
function SlotPickerModal({
  slot,
  state,
  locale,
  items,
  onPick,
  onClose,
  pendingItemId,
}: {
  slot: EquippedSlot;
  state: RoomState;
  locale: Locale;
  items: CharacterItem[];
  onPick: (itemId: string) => void;
  onClose: () => void;
  pendingItemId: string | null;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-lg border-2 border-b-0 border-abyss-soul/70 bg-abyss-deep p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-2 text-center text-[10px] uppercase tracking-widest text-abyss-soul">
          {t(locale, `inventory.slot.${slot}`)}
        </p>
        {items.length === 0 ? (
          <p className="py-6 text-center text-xs text-abyss-mist">
            {t(locale, "inventory.no_compatible_items")}
          </p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {items.map((item) => {
              const cat = state.item_catalog[item.item_id];
              const isPending = pendingItemId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => onPick(item.id)}
                  className="flex w-full items-center gap-2 rounded border border-abyss-coal/70 bg-abyss-void/60 px-2 py-1.5 text-left hover:bg-abyss-coal/30 disabled:opacity-50"
                >
                  <div
                    className="h-8 w-8 shrink-0"
                    style={{
                      backgroundImage: `url(${SLOT_FRAME_URL})`,
                      backgroundSize: "100% 100%",
                      imageRendering: "pixelated",
                      position: "relative",
                    }}
                  >
                    {cat?.icon_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cat.icon_path}
                        alt={cat.name_localized}
                        className="absolute inset-0.5 h-[calc(100%-4px)] w-[calc(100%-4px)] object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white">
                      {cat?.name_localized ?? item.item_id}
                    </p>
                    {cat?.weapon ? (
                      <p className="flex items-center gap-1 text-[9px] text-abyss-soul">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ATK_ICON_URL} alt="" width={10} height={10} className="h-2.5 w-2.5" style={{ imageRendering: "pixelated" }} />
                        +{cat.weapon.base_atk}
                      </p>
                    ) : null}
                    {cat?.armor ? (
                      <p className="flex items-center gap-1 text-[9px] text-abyss-soul">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={DEF_ICON_URL} alt="" width={10} height={10} className="h-2.5 w-2.5" style={{ imageRendering: "pixelated" }} />
                        +{cat.armor.base_def}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded border border-abyss-coal/70 py-1.5 text-[10px] uppercase tracking-widest text-abyss-fog hover:bg-abyss-coal/30"
        >
          {t(locale, "inventory.close")}
        </button>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex-1 border-b-2 px-2 py-2 text-[11px] font-semibold uppercase tracking-widest transition " +
        (active
          ? "border-abyss-soul text-white"
          : "border-transparent text-abyss-fog hover:text-abyss-mist")
      }
    >
      {children}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * ITEM DETAIL MODAL — full card with all stats + actions
 *   Opens when tapping an item in the InventarioTab list.
 * ────────────────────────────────────────────────────────────────── */
function ItemDetailModal({
  item,
  cat,
  locale,
  isEquipped,
  targetSlot,
  pending,
  onClose,
  onEquip,
}: {
  item: CharacterItem;
  cat: ItemCatalogEntry;
  locale: Locale;
  isEquipped: boolean;
  targetSlot: EquippedSlot | null;
  pending: boolean;
  onClose: () => void;
  onEquip: (slot: EquippedSlot) => void;
}) {
  const canEquip =
    !isEquipped &&
    targetSlot !== null &&
    (cat.item_type === "weapon" ||
      cat.item_type === "armor" ||
      cat.item_type === "accessory");
  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border-2 border-abyss-soul/80 bg-abyss-deep p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-start gap-3">
          <div
            className="relative h-14 w-14 shrink-0"
            style={{
              backgroundImage: `url(${SLOT_FRAME_URL})`,
              backgroundSize: "100% 100%",
              imageRendering: "pixelated",
            }}
          >
            {cat.icon_path ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cat.icon_path}
                alt=""
                className="absolute inset-1.5 h-[calc(100%-12px)] w-[calc(100%-12px)] object-contain"
                style={{ imageRendering: "pixelated" }}
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white">{cat.name_localized}</p>
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-abyss-fog">
              {(() => {
                const ico = categoryIconUrl(cat.item_type);
                return ico ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ico} alt="" width={12} height={12} className="h-3 w-3" style={{ imageRendering: "pixelated" }} />
                ) : null;
              })()}
              {t(locale, `inventory.category.${cat.item_type}`)}
            </p>
            {isEquipped ? (
              <span className="mt-1 inline-block rounded bg-abyss-soul/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-abyss-soul">
                {t(locale, "inventory.tab_equipped")}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-lg text-abyss-fog hover:text-white"
            aria-label={t(locale, "inventory.close")}
          >
            ✕
          </button>
        </header>

        <div className="space-y-1.5 rounded border border-abyss-coal/60 bg-abyss-void/60 p-3">
          {cat.weapon ? (
            <>
              <KV icon={ATK_ICON_URL} label={t(locale, "stats.atk")} value={`+${cat.weapon.base_atk}`} />
              <KV
                label={t(locale, "inventory.handedness_label")}
                value={
                  cat.weapon.handedness === "two_handed"
                    ? t(locale, "inventory.handedness.two_handed")
                    : cat.weapon.handedness === "off_hand"
                      ? t(locale, "inventory.handedness.off_hand")
                      : t(locale, "inventory.handedness.one_handed")
                }
              />
              <BonusRows bonuses={cat.weapon} locale={locale} />
            </>
          ) : null}
          {cat.armor ? (
            <>
              <KV icon={DEF_ICON_URL} label={t(locale, "stats.def")} value={`+${cat.armor.base_def}`} />
              <KV
                label={t(locale, "inventory.armor_slot_label")}
                value={t(locale, `inventory.armor_slot.${cat.armor.slot}`)}
              />
              <BonusRows bonuses={cat.armor} locale={locale} />
            </>
          ) : null}
          {item.durability !== null ? (
            <KV label={t(locale, "inventory.durability_label")} value={item.durability} />
          ) : null}
          {item.quantity > 1 ? (
            <KV label={t(locale, "inventory.quantity_label")} value={item.quantity} />
          ) : null}
        </div>

        {canEquip && targetSlot ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onEquip(targetSlot)}
            className="mt-3 w-full rounded bg-abyss-soul px-3 py-2 text-xs font-bold uppercase tracking-widest text-abyss-void hover:bg-abyss-soul/90 disabled:opacity-50"
          >
            {t(locale, "inventory.equip_action")}
          </button>
        ) : null}
        {isEquipped ? (
          <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-abyss-fog">
            {t(locale, "inventory.equipped_hint")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Renders the optional bonus_str / bonus_agi / bonus_int / bonus_spi /
 *  bonus_hp / bonus_mp rows from a weapon or armor catalog entry. Skips
 *  zero values so only meaningful bonuses appear. */
function BonusRows({
  bonuses,
  locale,
}: {
  bonuses: { bonus_str: number; bonus_agi: number; bonus_int: number; bonus_spi: number; bonus_hp: number; bonus_mp: number };
  locale: Locale;
}) {
  const rows: Array<{ icon: string; label: string; value: number }> = [];
  if (bonuses.bonus_str > 0) rows.push({ icon: STR_ICON_URL, label: "STR",                       value: bonuses.bonus_str });
  if (bonuses.bonus_agi > 0) rows.push({ icon: AGI_ICON_URL, label: "AGI",                       value: bonuses.bonus_agi });
  if (bonuses.bonus_int > 0) rows.push({ icon: INT_ICON_URL, label: "INT",                       value: bonuses.bonus_int });
  if (bonuses.bonus_spi > 0) rows.push({ icon: SPI_ICON_URL, label: "SPI",                       value: bonuses.bonus_spi });
  if (bonuses.bonus_hp  > 0) rows.push({ icon: HP_ICON_URL,  label: t(locale, "stats.hp"),       value: bonuses.bonus_hp  });
  if (bonuses.bonus_mp  > 0) rows.push({ icon: MP_ICON_URL,  label: t(locale, "stats.mp"),       value: bonuses.bonus_mp  });
  if (rows.length === 0) return null;
  return (
    <>
      {rows.map((r) => (
        <KV key={r.label} icon={r.icon} label={r.label} value={`+${r.value}`} />
      ))}
    </>
  );
}

/** True if `cat` can be placed in `slot`. */
function slotIsCompatible(cat: ItemCatalogEntry, slot: EquippedSlot): boolean {
  if (cat.item_type === "weapon" && cat.weapon) {
    if (cat.weapon.handedness === "two_handed") return slot === "main_hand";
    if (cat.weapon.handedness === "off_hand") return slot === "off_hand";
    return slot === "main_hand" || slot === "off_hand";
  }
  if (cat.item_type === "armor" && cat.armor) {
    const map: Record<string, EquippedSlot> = {
      head: "armor_head",
      chest: "armor_chest",
      arms: "armor_arms",
      legs: "armor_legs",
      feet: "armor_feet",
      off_hand_shield: "off_hand",
    };
    return map[cat.armor.slot] === slot;
  }
  if (cat.item_type === "accessory" && cat.accessory) {
    if (cat.accessory.slot === "ring") {
      return slot === "accessory_ring_1" || slot === "accessory_ring_2";
    }
    if (cat.accessory.slot === "amulet") return slot === "accessory_amulet";
  }
  return false;
}
