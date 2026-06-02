"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ApiError,
  devResetTutorial,
  equipItem,
  fetchRoom,
  interactWithProp,
  sendCombatAction,
  startEncounter,
  moveCharacter,
  pickupGroundItem,
  unequipItem,
  type CombatLogEntry,
  type CombatSession,
  type Direction,
  type EquippedSlot,
  type EncounterMob,
  type InteractReward,
  type RoomNpc,
  type RoomState,
  type TutorialStep,
} from "@/lib/client/api";
import { t, type Locale } from "@/lib/i18n";
import { optimisticEquip, optimisticInteract, optimisticUnequip } from "@/lib/client/optimistic";

import DialogueModal from "./DialogueModal";
import { TutorialHint } from "./TutorialHint";
import { InventoryPanel } from "./InventoryPanel";
import { CombatOverlay } from "./CombatOverlay";

type Props = {
  initData: string;
  characterId: string;
  characterName: string;
  locale: Locale;
  onExit: () => void;
};

const BANNER_DURATION_MS = 2200;
/** DEV ONLY — when true, the tutorial state is wiped on every app
 *  open so we can keep retesting. Flip to false before shipping. */
const TUTORIAL_DEV_RESET = true;

export default function PhaserExploration({
  initData,
  characterId,
  characterName,
  locale,
  onExit,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<unknown>(null);
  const sceneRef = useRef<unknown>(null);
  const stateRef = useRef<RoomState | null>(null);

  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [adjacentNpc, setAdjacentNpc] = useState<RoomNpc | null>(null);
  const [activeNpc, setActiveNpc] = useState<RoomNpc | null>(null);
  const [moving, setMoving] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showPickupPrompt, setShowPickupPrompt] = useState(false);
  /** When non-null the Z HUD prompt is the "open chest / interact" one
   *  instead of the ground-item one — text changes accordingly. */
  const [interactPrompt, setInteractPrompt] = useState<{ kind: string; x: number; y: number } | null>(null);
  /** Brief toast shown after a successful chest open / loot grant. */
  const [rewardToast, setRewardToast] = useState<InteractReward | null>(null);
  /** Phase 4a: when an encounter trigger fires we run a quick cutscene
   *  (enemies walk in) then show the placeholder pre-combat modal
   *  until the real combat scene ships. `null` = no cutscene running. */
  const [encounterCutscene, setEncounterCutscene] = useState<{ encounterId: string; mobs: EncounterMob[]; session: CombatSession } | null>(null);
  /** True once the cutscene walk-in finishes and we're showing the
   *  combat overlay (Phase 4b — was a placeholder modal in 4a). */
  const [showCombat, setShowCombat] = useState(false);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  /** When true the inventory is open AND can't be closed (tutorial
   *  step equip_sword). Hides the X button and ignores ESC. */
  const inventoryForced = state?.player.tutorial_step === "equip_sword";

  // Translate the current tutorial step to the set of directions the
  // player is allowed to actually move. null = free play (all 4).
  const allowedDirsForStep: Set<Direction> | null = useMemo(() => {
    const step: TutorialStep = state?.player.tutorial_step ?? "complete";
    if (step === "walk_to_cedric") return new Set<Direction>(["north"]);
    if (step === "after_dialogue" || step === "pickup_sword") {
      return new Set<Direction>(["north", "south", "east", "west"]);
    }
    if (step === "equip_sword") return new Set<Direction>();
    return null;
  }, [state?.player.tutorial_step]);

  // Boot Phaser once. doMove is captured via closure → fine to skip dep.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;
    void boot();
    return () => {
      cancelled = true;
      const g = gameRef.current as { destroy?: (b: boolean) => void } | null;
      g?.destroy?.(true);
      gameRef.current = null;
      sceneRef.current = null;
    };

    async function boot() {
      try {
        // DEV: wipe tutorial state on every boot so the flow restarts
        // from scratch. Removed once the tutorial is locked in.
        if (TUTORIAL_DEV_RESET) {
          try {
            await devResetTutorial({ initData, characterId });
          } catch {
            // best-effort — if the reset fails the room load still
            // proceeds, just with whatever state is already there
          }
        }
        const initial = await fetchRoom({ initData, characterId, locale });
        if (cancelled) return;
        stateRef.current = initial;
        setState(initial);
        flashBanner();

        const PhaserMod = await import("phaser");
        const sceneMod = await import("@/lib/game/scene");
        const Phaser = PhaserMod.default;
        const { AbyssScene } = sceneMod;

        if (cancelled) return;

        const callbacks = {
          onExitRequested: (direction: Direction) => {
            if (cancelled) return;
            void doMove(direction);
          },
          onNpcAdjacent: (npcId: string | null) => {
            if (cancelled) return;
            const cur = stateRef.current;
            const npc =
              cur && npcId ? cur.npcs.find((n) => n.id === npcId) ?? null : null;
            setAdjacentNpc(npc);
          },
          onGroundItemPickup: (groundItemId: string) => {
            if (cancelled) return;
            void doPickup(groundItemId);
          },
          onPropInteract: (propKind: string, tileX: number, tileY: number) => {
            if (cancelled) return;
            void doInteract(propKind, tileX, tileY);
          },
          onEncounterTriggered: (encounterId: string, mobIds: string[]) => {
            if (cancelled) return;
            void doEncounterStart(encounterId, mobIds);
          },
        };

        const game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: containerRef.current!,
          backgroundColor: "#06070C",
          pixelArt: true,
          antialias: false,
          // Use Phaser defaults: requestAnimationFrame at 60fps. The
          // previous `{ target: 30, forceSetTimeOut: true }` config was
          // a copy-paste from a legacy Phaser tutorial and caused two
          // mobile-only regressions:
          //   1. Hard cap at 30fps made everything feel chunky.
          //   2. forceSetTimeOut: true forces setTimeout instead of
          //      requestAnimationFrame for the game loop. Modern mobile
          //      browsers aggressively throttle setTimeout when the
          //      WebView loses focus or after the tab has been idle —
          //      this is exactly the "se cuelga con tiempo" symptom the
          //      user reported. setTimeout also has worse latency for
          //      input handling, which compounded into rapid-tap lag.
          // requestAnimationFrame syncs with display vblank, isn't
          // throttled when in focus, and gives Phaser proper delta
          // values for smooth animation timing.
          scale: {
            // RESIZE keeps the canvas filling the wrapper div on every
            // viewport change. The camera follows the player so even
            // tall portrait screens reveal more map without leaving big
            // black bars at top/bottom.
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: "100%",
            height: "100%",
          },
          scene: [],
          autoFocus: false,
          // Listen to input events ONLY on the canvas, not on the window. Without
          // this Phaser registers global touch handlers that capture taps on the
          // overlaid D-pad buttons before they reach React. Keyboard arrows still
          // work because they're registered on the canvas focus.
          input: { windowEvents: false },
        });
        gameRef.current = game;

        // Add the scene with autoStart so init() runs with our state +
        // callbacks. `add()` can return null in Phaser 4 when the manager
        // hasn't finished booting yet, so we don't trust its return value:
        // we poll `getScene(KEY)` until the instance is available, then
        // store it in the ref. The user reported `sceneRefType: 'object'`
        // with `sceneOk: false`, which is `typeof null === 'object'` — i.e.
        // we were caching the null that `add()` handed back.
        game.scene.add(AbyssScene.KEY, AbyssScene, true, {
          state: initial,
          callbacks,
        });

        const attachScene = (attempt = 0) => {
          if (cancelled) return;
          const live = game.scene.getScene(AbyssScene.KEY) as
            | InstanceType<typeof AbyssScene>
            | null;
          if (live && typeof live.pressDirectionOnce === "function") {
            sceneRef.current = live;
            console.log("[abyss/boot] scene attached", { attempt });
            return;
          }
          if (attempt >= 50) {
            console.warn("[abyss/boot] scene never appeared after 50 retries");
            return;
          }
          setTimeout(() => attachScene(attempt + 1), 30);
        };
        attachScene();
      } catch (err) {
        if (!cancelled) setError(humanize(err, locale));
      }
    }
  }, [initData, characterId, locale]);

  function flashBanner() {
    setShowBanner(true);
    window.setTimeout(() => setShowBanner(false), BANNER_DURATION_MS);
  }

  async function doMove(direction: Direction) {
    if (moving) return;
    setMoving(true);
    try {
      // Pokemon-style cinematic transition. The instant the user
      // commits to crossing a door:
      //   1. Tell the scene to fade the camera to black (~200ms).
      //   2. Fire the network request in parallel.
      //   3. Wait for BOTH to finish — fade hides the network latency.
      //   4. Call loadRoom while the screen is fully black, so the
      //      tear-down + rebuild + sprite re-creation all happen out
      //      of sight.
      //   5. buildRoomFromState ends with cameras.fadeIn() so the new
      //      room reveals smoothly.
      // The player never sees themselves "waiting on the door tile"
      // because the door tile is hidden under the fade by the time
      // the tween reaches it.
      const FADE_MS = 200;
      const scene = sceneRef.current as {
        loadRoom?: (s: RoomState) => void;
        startFadeOut?: (ms?: number) => void;
      } | null;
      scene?.startFadeOut?.(FADE_MS);
      const [moveResp] = await Promise.all([
        moveCharacter({ initData, characterId, direction, locale }),
        new Promise<void>((resolve) => window.setTimeout(resolve, FADE_MS + 20)),
      ]);
      const next = moveResp.room_state;
      stateRef.current = next;
      setState(next);
      scene?.loadRoom?.(next);
      flashBanner();
    } catch (err) {
      setError(humanize(err, locale));
    } finally {
      setMoving(false);
    }
  }

  function dpadPress(direction: Direction) {
    const scene = sceneRef.current as { pressDirectionOnce?: (d: Direction) => void } | null;
    scene?.pressDirectionOnce?.(direction);
  }

  function dpadHold(direction: Direction | null) {
    const scene = sceneRef.current as { setVirtualDirection?: (d: Direction | null) => void } | null;
    scene?.setVirtualDirection?.(direction);
  }

  async function doPickup(groundItemId: string) {
    setPendingItemId(groundItemId);
    try {
      const resp = await pickupGroundItem({
        initData,
        characterId,
        groundItemId,
        locale,
      });
      const next = resp.room_state;
      stateRef.current = next;
      setState(next);
      const scene = sceneRef.current as { loadRoom?: (s: RoomState) => void } | null;
      scene?.loadRoom?.(next);
      // After pickup, the sword is in the inventory and tutorial step
      // advances to equip_sword. The inventory will force-open via the
      // inventoryForced computed flag.
    } catch (err) {
      setError(humanize(err, locale));
    } finally {
      setPendingItemId(null);
    }
  }

  async function doEquip(characterItemId: string, slot: EquippedSlot) {
    // Snapshot pre-equip state for rollback if the server rejects the
    // intent. The optimistic preview lets the UI update INSTANTLY
    // (item moves into the slot, atk/def adjusts) while the request is
    // in flight — players were complaining the equip felt sluggish.
    const snapshot = stateRef.current;
    if (!snapshot) return;
    const prevStep = snapshot.player.tutorial_step;
    const predicted = optimisticEquip(snapshot, characterItemId, slot);
    if (predicted) {
      stateRef.current = predicted;
      setState(predicted);
    }
    setPendingItemId(characterItemId);
    try {
      const resp = await equipItem({
        initData,
        characterId,
        characterItemId,
        slot,
        locale,
      });
      const next = resp.room_state;
      stateRef.current = next;
      setState(next);
      // Auto-close ONLY when this equip is the one that JUST completed
      // the tutorial (equip_sword → complete). Any later equip leaves
      // the inventory open so players can keep swapping gear.
      if (prevStep === "equip_sword" && next.player.tutorial_step === "complete") {
        setShowInventory(false);
      }
    } catch (err) {
      // Server rejected — undo the optimistic preview.
      if (predicted) {
        stateRef.current = snapshot;
        setState(snapshot);
      }
      setError(humanize(err, locale));
    } finally {
      setPendingItemId(null);
    }
  }

  async function doEncounterStart(encounterId: string, mobIds: string[]) {
    void mobIds; // Server resolves mob_ids from the prop metadata for
    //              anti-cheat; the scene-side list is just a hint.
    try {
      const resp = await startEncounter({
        initData,
        characterId,
        encounterId,
        locale,
      });
      stateRef.current = resp.room_state;
      setState(resp.room_state);
      setEncounterCutscene({ encounterId, mobs: resp.mobs, session: resp.combat_session });

      // Drive the cutscene: enemies emerge from the room's south
      // door tile (player came from the north), walk north to one
      // tile in front of the player, settle on south-facing idle.
      const scene = sceneRef.current as {
        spawnCutsceneMob?: (opts: {
          mobId: string;
          fromTile: { x: number; y: number };
          toTile: { x: number; y: number };
          walkDir: Direction;
          finalDir: Direction;
          durationMs?: number;
        }) => Promise<unknown>;
        markEncounterSeen?: (id: string) => void;
      } | null;
      scene?.markEncounterSeen?.(encounterId);

      // Hard-coded layout for the bridge ambush: south door (6, 10),
      // line the mobs up one tile in front of the player on the
      // south side (player's at the trigger tile 6, 8 → mobs land
      // at y=9, one each side of the column). Future encounters can
      // declare these positions in metadata.
      const targets = [
        { x: 5, y: 9 },
        { x: 7, y: 9 },
      ];
      const fromTile = { x: 6, y: 10 };
      const walks = resp.mobs.slice(0, 2).map((m, i) =>
        scene?.spawnCutsceneMob?.({
          mobId: m.id,
          fromTile,
          toTile: targets[i] ?? fromTile,
          walkDir: "north",
          finalDir: "north",
          durationMs: 1600,
        }) ?? Promise.resolve(null),
      );
      await Promise.all(walks);
      // Beat of stillness, then open the combat overlay (replaces
      // the Phase-4a placeholder modal).
      window.setTimeout(() => setShowCombat(true), 350);
    } catch (err) {
      const scene = sceneRef.current as { setCutsceneActive?: (a: boolean) => void } | null;
      scene?.setCutsceneActive?.(false);
      setEncounterCutscene(null);
      setError(humanize(err, locale));
    }
  }

  async function doCombatAttack(targetMobIdx: number): Promise<{
    nextSession: CombatSession;
    appended: CombatLogEntry[];
  }> {
    const enc = encounterCutscene;
    if (!enc) throw new Error("NO_ACTIVE_COMBAT");
    const resp = await sendCombatAction({
      initData,
      characterId,
      sessionId: enc.session.id,
      action: "attack",
      targetMobIdx,
      locale,
    });
    // The /combat/action response also brings the latest RoomState
    // (used after the overlay closes on victory / defeat — by then
    // server-side finalizeCombat has already applied rewards or
    // respawn). Stash it for closeCombat to read.
    stateRef.current = resp.room_state;
    setState(resp.room_state);
    setEncounterCutscene({ ...enc, session: resp.session });
    return { nextSession: resp.session, appended: resp.appended };
  }

  function closeCombat(_outcome: "victory" | "defeat") {
    void _outcome; // Server-side finalizeCombat has already handled
    //                rewards / respawn; the latest RoomState is in
    //                stateRef.current. Just close the overlay and
    //                trigger a scene reload (cross-room transitions
    //                happen automatically because loadRoom detects
    //                the changed room.id and resets spawn).
    setShowCombat(false);
    setEncounterCutscene(null);
    const scene = sceneRef.current as {
      setCutsceneActive?: (a: boolean) => void;
      loadRoom?: (s: RoomState) => void;
    } | null;
    scene?.setCutsceneActive?.(false);
    if (stateRef.current) scene?.loadRoom?.(stateRef.current);
  }

  async function doInteract(propKind: string, tileX: number, tileY: number) {
    const snapshot = stateRef.current;
    if (!snapshot) return;
    // Optimistic: predict the chest opening + the loot landing in
    // inventory, swap the sprite + show the toast IMMEDIATELY. The
    // server confirms in the background; if it rejects we roll back.
    // User reported the interact felt sluggish — this kills the
    // round-trip wait the same way equip/unequip handle it.
    const predicted = optimisticInteract(snapshot, propKind, tileX, tileY);
    const scene = sceneRef.current as { loadRoom?: (s: RoomState) => void } | null;
    if (predicted) {
      stateRef.current = predicted.state;
      setState(predicted.state);
      scene?.loadRoom?.(predicted.state);
      setRewardToast(predicted.reward);
      window.setTimeout(() => setRewardToast(null), 3000);
    }
    try {
      const resp = await interactWithProp({
        initData,
        characterId,
        propKind,
        tileX,
        tileY,
        locale,
      });
      // Server returns the authoritative state — swap it in. We
      // DON'T re-load the scene when a prediction already ran;
      // the predicted shape matches the server output (same
      // opened_props key, same inventory stacks) so a second
      // loadRoom would just tear down + rebuild the same sprites
      // and risk flicker.
      stateRef.current = resp.room_state;
      setState(resp.room_state);
      if (!predicted) {
        scene?.loadRoom?.(resp.room_state);
        setRewardToast(resp.reward);
        window.setTimeout(() => setRewardToast(null), 3000);
      }
    } catch (err) {
      // Server rejected (e.g. PROP_ALREADY_OPENED if some prior
      // request snuck in) — undo the optimistic preview.
      if (predicted) {
        stateRef.current = snapshot;
        setState(snapshot);
        scene?.loadRoom?.(snapshot);
        setRewardToast(null);
      }
      setError(humanize(err, locale));
    }
  }

  async function doUnequip(characterItemId: string) {
    const snapshot = stateRef.current;
    if (!snapshot) return;
    const predicted = optimisticUnequip(snapshot, characterItemId);
    if (predicted) {
      stateRef.current = predicted;
      setState(predicted);
    }
    setPendingItemId(characterItemId);
    try {
      const resp = await unequipItem({ initData, characterId, characterItemId, locale });
      stateRef.current = resp.room_state;
      setState(resp.room_state);
    } catch (err) {
      if (predicted) {
        stateRef.current = snapshot;
        setState(snapshot);
      }
      setError(humanize(err, locale));
    } finally {
      setPendingItemId(null);
    }
  }

  // ── Tutorial-driven side effects ────────────────────────────────────

  // Push the allowed direction set down into the Phaser scene whenever
  // the tutorial step changes. Scene silently ignores disallowed dirs.
  useEffect(() => {
    const scene = sceneRef.current as {
      setAllowedDirections?: (s: Set<Direction> | null) => void;
    } | null;
    scene?.setAllowedDirections?.(allowedDirsForStep);
  }, [allowedDirsForStep, state]);

  // Auto-open dialogue when the player walks up to Cedric during
  // walk_to_cedric — the player shouldn't have to discover the talk
  // button on their first run.
  useEffect(() => {
    if (!state || !adjacentNpc) return;
    if (state.player.tutorial_step !== "walk_to_cedric") return;
    if (adjacentNpc.id !== "cedric_the_broken") return;
    setActiveNpc(adjacentNpc);
  }, [adjacentNpc, state]);

  // Force the inventory open when the tutorial requires equipping.
  useEffect(() => {
    if (inventoryForced) setShowInventory(true);
  }, [inventoryForced]);

  // Show / hide the floor "Z to pick up" + chest "Z to open" prompts.
  // Polled at 150ms because Phaser updates adjacency inside attemptMove,
  // not as a React event. Ground pickup wins precedence over interact
  // (same priority the scene uses for the Z handler) so the UI label
  // never disagrees with the action that will fire.
  useEffect(() => {
    const interval = window.setInterval(() => {
      const scene = sceneRef.current as {
        getAdjacentGroundItemId?: () => string | null;
        getAdjacentInteractableProp?: () => { kind: string; x: number; y: number } | null;
      } | null;
      const ground = !!scene?.getAdjacentGroundItemId?.();
      setShowPickupPrompt(ground);
      setInteractPrompt(ground ? null : scene?.getAdjacentInteractableProp?.() ?? null);
    }, 150);
    return () => window.clearInterval(interval);
  }, []);

  // Hotkeys: I toggles the inventory (unless forced), ESC closes it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "i" || e.key === "I") {
        if (inventoryForced) return;
        setShowInventory((s) => !s);
      } else if (e.key === "Escape") {
        if (inventoryForced) return;
        setShowInventory(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inventoryForced]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border border-abyss-coal/80 bg-abyss-deep px-3 py-2">
        <button
          type="button"
          onClick={onExit}
          className="text-[10px] uppercase tracking-widest text-abyss-mist hover:text-white"
        >
          ‹ {t(locale, "exploration.back_to_hub")}
        </button>
        <span className="truncate text-[10px] uppercase tracking-widest text-abyss-fog">
          {characterName}
        </span>
      </div>

      <div
        className="relative w-full overflow-hidden rounded-lg border border-abyss-coal/80 bg-abyss-void"
        style={{ height: "calc(100dvh - 180px)", minHeight: "400px" }}
      >
        {/* Phaser canvas. pointer-events:none on the wrapper + the
            data-attribute selector in globals.css make sure the <canvas>
            Phaser injects also inherits pointer-events:none. Without the
            CSS override the canvas was intercepting taps on the D-pad. */}
        <div
          ref={containerRef}
          data-phaser-canvas-host=""
          className="absolute inset-0"
          style={{ pointerEvents: "none" }}
        />

        {showBanner && state ? (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <div className="rounded-md border border-abyss-soul/60 bg-abyss-deep/90 px-4 py-2 text-center shadow-lg backdrop-blur">
              <p className="text-[9px] uppercase tracking-[0.4em] text-abyss-fog">
                {t(locale, "exploration.floor_label", { floor: state.room.floor_number })}
                {" · "}
                {t(locale, `exploration.room_type.${state.room.room_type}`)}
              </p>
              <p className="mt-0.5 bg-gradient-to-b from-abyss-soul via-abyss-khaos to-abyss-ember bg-clip-text text-base font-bold uppercase tracking-widest text-transparent">
                {state.room.name_localized}
              </p>
            </div>
          </div>
        ) : null}

        {/* NPC adjacent CTA — overlays the canvas at top-left when available */}
        {adjacentNpc ? (
          <button
            type="button"
            onClick={() => setActiveNpc(adjacentNpc)}
            className="absolute left-2 right-2 top-2 flex items-center gap-2 rounded-md border border-abyss-soul/70 bg-abyss-deep/95 p-2 text-left shadow-lg backdrop-blur sm:left-auto sm:right-2 sm:max-w-[220px]"
          >
            {adjacentNpc.portrait_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={adjacentNpc.portrait_url}
                alt={adjacentNpc.name_localized}
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 rounded bg-abyss-void object-contain"
                style={{ imageRendering: "pixelated" }}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{adjacentNpc.name_localized}</p>
              <p className="text-[9px] uppercase tracking-widest text-abyss-soul">
                {t(locale, "exploration.talk_prompt")}
              </p>
            </div>
            <span className="text-abyss-soul">›</span>
          </button>
        ) : null}

        {/* D-pad pinned to bottom-right of the canvas as a HUD overlay.
            Explicit z-index so it sits above the Phaser <canvas>, and the
            buttons stop propagation in their handlers so any stray Phaser
            input listener can't swallow the tap. */}
        <div className="absolute bottom-2 right-2 z-30">
          <DPad onPress={dpadPress} onHold={dpadHold} disabled={moving} />
        </div>

        {/* Inventory toggle (top-left) — visible when not in tutorial,
            disabled during tutorial steps that gate it. */}
        {state && !inventoryForced ? (
          <button
            type="button"
            onClick={() => setShowInventory(true)}
            className="absolute left-2 bottom-2 z-30 flex h-12 w-12 items-center justify-center rounded-md border-2 border-abyss-soul/70 bg-abyss-deep/95 text-2xl text-abyss-soul shadow-lg backdrop-blur hover:bg-abyss-coal/60"
            aria-label={t(locale, "inventory.title")}
            title={`${t(locale, "inventory.title")} (I)`}
          >
            🎒
          </button>
        ) : null}

        {/* Tutorial hint banner — shows the current step. */}
        {state ? (
          <TutorialHint step={state.player.tutorial_step} locale={locale} />
        ) : null}

        {/* "Z to pick up" prompt — TAPPABLE button. Positioned above the
            D-pad area (bottom-44 = 11rem) so the player's left thumb
            doesn't hit the West arrow by accident. On desktop the Z
            keyboard handler also triggers the pickup; here we let the
            player just tap the prompt directly. */}
        {showPickupPrompt ? (
          <button
            type="button"
            onClick={() => {
              const scene = sceneRef.current as {
                getAdjacentGroundItemId?: () => string | null;
              } | null;
              const id = scene?.getAdjacentGroundItemId?.();
              if (id) void doPickup(id);
            }}
            className="absolute bottom-44 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-lg border-2 border-abyss-soul bg-abyss-deep/95 px-4 py-2 shadow-2xl backdrop-blur hover:bg-abyss-coal/60 active:scale-95 transition animate-pulse"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded border border-abyss-soul/80 bg-abyss-void text-base font-bold text-abyss-soul">
              Z
            </span>
            <span className="text-sm font-semibold text-white">
              {t(locale, "tutorial.pickup_prompt")}
            </span>
          </button>
        ) : null}

        {/* "Z to open chest" prompt — same shape as the pickup prompt
            but a different label, only shown when no ground item is
            available (ground takes priority in the scene's Z handler). */}
        {interactPrompt ? (
          <button
            type="button"
            onClick={() => {
              if (interactPrompt) {
                void doInteract(interactPrompt.kind, interactPrompt.x, interactPrompt.y);
              }
            }}
            className="absolute bottom-44 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-lg border-2 border-amber-400 bg-abyss-deep/95 px-4 py-2 shadow-2xl backdrop-blur hover:bg-abyss-coal/60 active:scale-95 transition animate-pulse"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded border border-amber-400/80 bg-abyss-void text-base font-bold text-amber-300">
              Z
            </span>
            <span className="text-sm font-semibold text-white">
              {t(locale, "interact.open_prompt")}
            </span>
          </button>
        ) : null}

        {/* Reward toast — slides in for ~3s after a successful chest
            open. Uses the message_key the server returned so the copy
            stays i18n-driven and the server controls flavour. */}
        {rewardToast ? (
          <div className="absolute left-1/2 top-20 z-40 -translate-x-1/2 rounded-lg border-2 border-amber-400 bg-abyss-deep/95 px-4 py-2 text-center shadow-2xl backdrop-blur">
            <p className="text-sm font-semibold text-amber-200">
              {t(locale, rewardToast.message_key)}
            </p>
          </div>
        ) : null}

        {/* Pre-combat fade overlay — drops in over the canvas while
            the cutscene mobs walk in, then the CombatOverlay takes
            over the screen. */}
        {encounterCutscene && !showCombat ? (
          <div className="pointer-events-none absolute inset-0 z-30 bg-black opacity-30 transition-opacity duration-700" />
        ) : null}
        {showCombat && encounterCutscene && state ? (
          <CombatOverlay
            locale={locale}
            session={encounterCutscene.session}
            playerSpriteUrl={state.player.sprite_atlas?.south ?? null}
            playerName={state.player.name || characterName}
            playerLabel={`Nv.${state.player.level} · ${state.player.class_name}`}
            mobs={encounterCutscene.mobs}
            onAttack={doCombatAttack}
            onClose={closeCombat}
          />
        ) : null}

        {error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-abyss-void/80 p-6 text-center">
            <p className="text-sm text-abyss-ember">{error}</p>
          </div>
        ) : null}
      </div>

      {state?.room.description_localized ? (
        <p className="text-[11px] leading-relaxed text-abyss-mist">
          {state.room.description_localized}
        </p>
      ) : null}

      {activeNpc ? (
        <DialogueModal
          initData={initData}
          characterId={characterId}
          npc={activeNpc}
          locale={locale}
          onClose={async () => {
            setActiveNpc(null);
            try {
              const refreshed = await fetchRoom({ initData, characterId, locale });
              stateRef.current = refreshed;
              setState(refreshed);
              // CRITICAL: also push the new state into the Phaser scene
              // so the room actually re-renders — without this, the
              // tutorial-spawned ground item (sword) lives in React
              // state but never appears in the canvas. The player had
              // to leave + re-enter the room to see it.
              const scene = sceneRef.current as { loadRoom?: (s: RoomState) => void } | null;
              scene?.loadRoom?.(refreshed);
            } catch {
              // best-effort
            }
          }}
        />
      ) : null}

      {showInventory && state ? (
        <InventoryPanel
          state={state}
          locale={locale}
          forced={inventoryForced}
          pendingItemId={pendingItemId}
          onClose={() => setShowInventory(false)}
          onEquip={(id, slot) => void doEquip(id, slot)}
          onUnequip={(id) => void doUnequip(id)}
        />
      ) : null}
    </div>
  );
}

/**
 * `LONG_PRESS_DELAY_MS` is the threshold below which a button release counts
 * as a "tap" — that means a single grid step. Holding past this threshold
 * activates the continuous-walk virtual direction, which the Phaser update
 * loop polls every frame.
 *
 * Why split the two: when both happened on every press, a long-ish tap
 * (~200ms — typical on touchscreens) produced two moves. The press fired
 * one step + set the virtual direction, then the next update tick after
 * the cooldown picked up the still-set virtual direction and stepped
 * again. Splitting the modes by press duration makes the behaviour
 * deterministic regardless of how long the user holds.
 */
const LONG_PRESS_DELAY_MS = 250;

function DPad({
  onPress,
  onHold,
  disabled,
}: {
  onPress: (d: Direction) => void;
  onHold: (d: Direction | null) => void;
  disabled?: boolean;
}) {
  const dirs: Array<{ id: Direction; row: number; col: number; arrow: string }> = [
    { id: "north", row: 1, col: 2, arrow: "↑" },
    { id: "west", row: 2, col: 1, arrow: "←" },
    { id: "east", row: 2, col: 3, arrow: "→" },
    { id: "south", row: 3, col: 2, arrow: "↓" },
  ];
  // One timer per button instance so quick-fire taps don't fight each other.
  const holdTimeouts = useRef<Map<Direction, ReturnType<typeof setTimeout>>>(new Map());
  /**
   * Modern browsers fire BOTH `pointerdown` and `touchstart` for a single
   * tap. We register both handlers because some older WebViews only emit
   * touch events, but dedupe by timestamp so a single physical tap doesn't
   * count as two presses (which was producing the double-step regression).
   */
  const lastPressAt = useRef<Map<Direction, number>>(new Map());
  // 260ms matches MOVE_COOLDOWN_MS in scene.ts. Rapid-fire taps faster
  // than that are guaranteed to be no-ops on the Phaser side anyway
  // (the in-progress walk tween still owns the cooldown), so we may as
  // well drop them at the event boundary instead of paying the cost of
  // React/Phaser handler invocation for each ghost tap. On mobile
  // WebView the touch-event pipeline itself is expensive — fewer events
  // = less per-frame jank during rapid tapping.
  const DEDUP_MS = 260;

  function startPress(direction: Direction) {
    if (disabled) return;
    const now = performance.now();
    const last = lastPressAt.current.get(direction) ?? 0;
    if (now - last < DEDUP_MS) return; // dedup (both pointer/touch ghost AND user rapid-tap)
    lastPressAt.current.set(direction, now);
    onPress(direction);
    const existing = holdTimeouts.current.get(direction);
    if (existing) clearTimeout(existing);
    holdTimeouts.current.set(
      direction,
      setTimeout(() => onHold(direction), LONG_PRESS_DELAY_MS),
    );
  }

  function endPress(direction: Direction) {
    const existing = holdTimeouts.current.get(direction);
    if (existing) {
      clearTimeout(existing);
      holdTimeouts.current.delete(direction);
    }
    onHold(null);
  }

  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-1 w-[160px] select-none">
      {dirs.map((d) => (
        <button
          key={d.id}
          type="button"
          disabled={disabled}
          onPointerDown={(e) => {
            // No preventDefault: the button has `touch-action: none`
            // already, which handles double-tap zoom / text selection
            // at the CSS layer without paying preventDefault's per-event
            // compositor flush cost on mobile WebView.
            e.stopPropagation();
            startPress(d.id);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            endPress(d.id);
          }}
          onPointerLeave={() => endPress(d.id)}
          onPointerCancel={() => endPress(d.id)}
          // Older mobile browsers (some Telegram WebViews) deliver touchstart
          // before pointerdown is normalised — handle both so the input is
          // never swallowed by a sibling.
          onTouchStart={(e) => {
            e.stopPropagation();
            startPress(d.id);
          }}
          onTouchEnd={() => endPress(d.id)}
          style={{ gridRow: d.row, gridColumn: d.col, touchAction: "none" }}
          className="h-12 w-12 rounded-md border border-abyss-coal/80 bg-abyss-deep/95 text-lg text-abyss-mist shadow-md backdrop-blur transition active:bg-abyss-khaos/40 active:text-white disabled:opacity-50"
        >
          {d.arrow}
        </button>
      ))}
    </div>
  );
}

function humanize(err: unknown, locale: Locale): string {
  if (err instanceof ApiError) {
    const localized = t(locale, `errors.${err.code}`);
    if (localized !== `errors.${err.code}`) return localized;
    return err.detail ?? err.code;
  }
  return err instanceof Error ? err.message : t(locale, "errors.generic");
}
