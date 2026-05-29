"use client";

import { useMemo, useState } from "react";

import { t, type Locale } from "@/lib/i18n";
import type {
  CharacterItem,
  EquippedSlot,
  ItemCatalogEntry,
  RoomState,
} from "@/lib/client/api";

const PANEL_FRAME_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/b85c360074def113bc8734406197454a9179f8c698f5876b9c15b65c6884c9f8.png";
const SLOT_FRAME_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/5dc89ad9a52d6e028e75b88b091981d622722265f4d8b0001b8c4a49dfc388ba.png";

const INVENTORY_COLS = 5;
const INVENTORY_ROWS = 8;
const TOTAL_INVENTORY = INVENTORY_COLS * INVENTORY_ROWS;

const EQUIPPED_LAYOUT: Array<{ slot: EquippedSlot; row: number; col: number }> = [
  { slot: "armor_head", row: 1, col: 2 },
  { slot: "armor_chest", row: 2, col: 2 },
  { slot: "main_hand", row: 2, col: 1 },
  { slot: "off_hand", row: 2, col: 3 },
  { slot: "armor_arms", row: 3, col: 1 },
  { slot: "armor_legs", row: 3, col: 2 },
  { slot: "armor_feet", row: 3, col: 3 },
  { slot: "accessory_ring_1", row: 4, col: 1 },
  { slot: "accessory_amulet", row: 4, col: 2 },
  { slot: "accessory_ring_2", row: 4, col: 3 },
];

type Props = {
  state: RoomState;
  locale: Locale;
  /** When true, the close (X) is hidden and ESC is ignored — used to
   *  force the inventory open during the equip_sword tutorial step. */
  forced?: boolean;
  onClose: () => void;
  onEquip: (characterItemId: string, slot: EquippedSlot) => void;
  onUnequip: (characterItemId: string) => void;
  /** Inflight item id (the one being equipped/unequipped right now).
   *  Used to disable the buttons + show a subtle highlight. */
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
  const [tab, setTab] = useState<"inventory" | "stats">("inventory");

  // Build a 5x8 grid from the inventory array, keyed by slot index.
  const inventoryBySlot = useMemo(() => {
    const map = new Map<number, CharacterItem>();
    for (const item of state.inventory) {
      if (typeof item.slot === "number") map.set(item.slot, item);
    }
    return map;
  }, [state.inventory]);

  const equippedBySlot = useMemo(() => {
    const map = new Map<EquippedSlot, CharacterItem>();
    for (const item of state.equipped) {
      if (typeof item.slot === "string") map.set(item.slot as EquippedSlot, item);
    }
    return map;
  }, [state.equipped]);

  // Click an inventory item → equip into its compatible default slot.
  // Click an equipped item → unequip back to inventory.
  // For dual-wield weapons, default to main_hand if empty, else off_hand.
  function handleInventoryClick(item: CharacterItem) {
    const cat = state.item_catalog[item.item_id];
    if (!cat) return;
    const target = defaultSlotForItem(cat, equippedBySlot);
    if (!target) return;
    onEquip(item.id, target);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div
        className="relative w-full max-w-md"
        style={{
          backgroundImage: `url(${PANEL_FRAME_URL})`,
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
          imageRendering: "pixelated",
          minHeight: "560px",
        }}
      >
        {/* Inner content with padding to stay inside the ornate border */}
        <div className="px-9 py-12">
          {!forced ? (
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded text-lg text-abyss-soul hover:bg-abyss-coal/40 hover:text-white"
              aria-label={t(locale, "inventory.close")}
            >
              ✕
            </button>
          ) : null}

          <h2 className="mb-4 text-center text-base font-bold uppercase tracking-[0.3em] text-abyss-soul">
            {t(locale, "inventory.title")}
          </h2>

          {/* Tabs */}
          <div className="mb-4 flex gap-1 justify-center">
            <TabBtn active={tab === "inventory"} onClick={() => setTab("inventory")}>
              {t(locale, "inventory.tab_inventory")}
            </TabBtn>
            <TabBtn active={tab === "stats"} onClick={() => setTab("stats")}>
              {t(locale, "inventory.tab_stats")}
            </TabBtn>
          </div>

          {tab === "inventory" ? (
            <>
              {/* Equipped slots — top section, character silhouette layout */}
              <div className="mb-4 rounded border border-abyss-coal/60 bg-abyss-void/60 p-2">
                <p className="mb-2 text-center text-[9px] uppercase tracking-widest text-abyss-fog">
                  {t(locale, "inventory.tab_equipped")}
                </p>
                <div
                  className="mx-auto grid w-fit gap-1"
                  style={{ gridTemplateColumns: "repeat(3, 40px)", gridTemplateRows: "repeat(4, 40px)" }}
                >
                  {EQUIPPED_LAYOUT.map(({ slot, row, col }) => {
                    const item = equippedBySlot.get(slot);
                    const cat = item ? state.item_catalog[item.item_id] : null;
                    return (
                      <SlotCell
                        key={slot}
                        gridRow={row}
                        gridCol={col}
                        title={t(locale, `inventory.slot.${slot}`)}
                        item={item ?? null}
                        cat={cat ?? null}
                        disabled={pendingItemId === item?.id}
                        onClick={item ? () => onUnequip(item.id) : undefined}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Inventory grid 5x8 */}
              <div
                className="grid gap-1 mx-auto w-fit"
                style={{ gridTemplateColumns: `repeat(${INVENTORY_COLS}, 40px)` }}
              >
                {Array.from({ length: TOTAL_INVENTORY }, (_, idx) => {
                  const item = inventoryBySlot.get(idx) ?? null;
                  const cat = item ? state.item_catalog[item.item_id] : null;
                  return (
                    <SlotCell
                      key={idx}
                      title={cat?.name_localized}
                      item={item}
                      cat={cat ?? null}
                      disabled={pendingItemId === item?.id}
                      onClick={item ? () => handleInventoryClick(item) : undefined}
                    />
                  );
                })}
              </div>
            </>
          ) : null}

          {tab === "stats" ? (
            <div className="rounded border border-abyss-coal/60 bg-abyss-void/60 p-3 text-center text-xs text-abyss-mist">
              <p>Coming soon — full character sheet.</p>
            </div>
          ) : null}

          {forced ? (
            <p className="mt-4 text-center text-[10px] uppercase tracking-widest text-abyss-soul animate-pulse">
              {t(locale, "tutorial.step.equip_sword")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Default equipped slot for a single click on an inventory item. */
function defaultSlotForItem(
  cat: ItemCatalogEntry,
  currentlyEquipped: Map<EquippedSlot, CharacterItem>,
): EquippedSlot | null {
  if (cat.item_type === "weapon" && cat.weapon) {
    if (cat.weapon.handedness === "two_handed") return "main_hand";
    if (cat.weapon.handedness === "off_hand") return "off_hand";
    return currentlyEquipped.has("main_hand") && !currentlyEquipped.has("off_hand")
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
      return currentlyEquipped.has("accessory_ring_1")
        ? "accessory_ring_2"
        : "accessory_ring_1";
    }
    if (cat.accessory.slot === "amulet") return "accessory_amulet";
  }
  return null;
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
        active
          ? "rounded border border-abyss-soul/70 bg-abyss-deep px-3 py-1 text-[10px] uppercase tracking-widest text-white"
          : "rounded border border-abyss-coal/60 bg-abyss-void/60 px-3 py-1 text-[10px] uppercase tracking-widest text-abyss-fog hover:bg-abyss-coal/40"
      }
    >
      {children}
    </button>
  );
}

function SlotCell({
  item,
  cat,
  onClick,
  title,
  disabled,
  gridRow,
  gridCol,
}: {
  item: CharacterItem | null;
  cat: ItemCatalogEntry | null;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  gridRow?: number;
  gridCol?: number;
}) {
  const interactive = !!onClick && !disabled;
  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      title={title}
      style={{
        backgroundImage: `url(${SLOT_FRAME_URL})`,
        backgroundSize: "100% 100%",
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
        gridRow,
        gridColumn: gridCol,
      }}
      className={
        "relative aspect-square h-10 w-10 transition disabled:opacity-50 " +
        (interactive ? "hover:brightness-125 active:brightness-90" : "")
      }
    >
      {cat?.icon_path ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cat.icon_path}
          alt={cat.name_localized}
          width={32}
          height={32}
          className="absolute inset-1 h-[calc(100%-8px)] w-[calc(100%-8px)] object-contain"
          style={{ imageRendering: "pixelated" }}
        />
      ) : null}
      {item && item.quantity > 1 ? (
        <span className="absolute bottom-0 right-0.5 text-[9px] font-bold text-white drop-shadow">
          {item.quantity}
        </span>
      ) : null}
    </button>
  );
}
