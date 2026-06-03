/**
 * Phaser Scene that renders the current room from a `RoomState` snapshot.
 *
 * The scene is recreated (via `scene.restart({ state })`) every time the
 * server reports a room change. Inside the scene:
 *
 *   - tilemap built from `state.room.tilemap_data` + the biome's Wang
 *     metadata (see lib/game/wang.ts);
 *   - player sprite at `tilemap_data.spawn`, facing south by default;
 *   - NPC sprites at their `tile_x` / `tile_y`;
 *   - keyboard + injected D-pad → grid-step movement with wall collision;
 *   - emits `npc-adjacent` whenever the player's manhattan distance to
 *     an NPC is ≤ 1 (different from "talk" — talk is decided by React);
 *   - emits `exit-requested` when the player tries to step into a tile
 *     mapped to a connection direction.
 */

import Phaser from "phaser";

import type { AnimationAtlas, Direction, RoomState } from "@/lib/client/api";
import { buildTileIndexGrid, isWallCell } from "./wang";

export const TILE_SIZE = 16;
export const ZOOM = 3;
const RENDERED_TILE = TILE_SIZE * ZOOM;
/**
 * Step pacing. The cooldown is long enough that holding the D-pad does
 * not "spam" half-a-dozen steps before the user can react. A short
 * tween moves the sprite smoothly to the next tile inside that window
 * — by the time the cooldown ends, the player has visibly arrived and
 * can press again.
 */
const MOVE_COOLDOWN_MS = 260;
export const MOVE_TWEEN_MS = 220;
const TURN_COOLDOWN_MS = 100;
/**
 * v3 character canvases come back at 92×92 (real character ~55×41 inside
 * the padding). At 1× scale that's ~3 tiles tall — sprite would tower
 * over the tilemap and visually "occupy" walls 2 tiles away. 0.7 keeps
 * the visible character at ~38×28 px ≈ 1.2 tiles — a touch larger than
 * the strict-Pokemon 1.0 ratio so the detail of armor/weapon is legible
 * without bleeding over neighbouring walls.
 */
const CHARACTER_SCALE = 0.7;
/**
 * Origin Y at 1.0 puts the sprite's bottom edge on the tile anchor — the
 * character stands ON the tile rather than centered through it. This is
 * what makes the apparent "feet" of the character line up with the
 * walkable tile grid.
 */
const CHARACTER_ORIGIN_Y = 1.0;
/**
 * Frames-per-second for walk + idle. Pokemon-style tile-based movement
 * works best when ONE walk cycle = ONE step. Our step is ~260 ms
 * (220 ms tween + 40 ms cooldown), so 4 frames need to play in ~260 ms
 * → 4 / 0.260 ≈ 15 fps. At 8 fps the cycle was 500 ms — twice the step
 * — and the legs kept shuffling across steps instead of completing
 * one cycle per step, which the user felt as "muchos pasos a la vez".
 */
const ANIM_FRAMERATE = 15;
const ALL_DIRECTIONS: Direction[] = ["south", "north", "east", "west"];
type AnimState = "walk" | "idle";

/**
 * Every room exit is marked by a stone cave arch — the Pokemon Emerald
 * convention: a doorway carved INTO the wall, not a magical portal
 * floating in front of it. Hardcoded URL because every cave room reuses
 * the same arch; biome-specific arches can be wired later via the props
 * table the same way trees / dragons / bridges already are.
 */
const DOOR_SPRITE_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/74f4a2b680b7e9975a162a4e58edfbd8cd154fe7c5852a3d04bcdbf87dde6ac1.png";
const DOOR_TEXTURE_KEY = "prop-door-cave-arch";
/** Map prop kind → Phaser texture key. Stable so re-renders reuse cache. */
const propTextureKey = (kind: string) => `prop-${kind}`;

/** Derive a per-URL texture key for the cave background tile so
 *  swapping the underlying asset in R2 invalidates Phaser's in-memory
 *  texture cache automatically. Hard-coding "bg-tile" left the old
 *  texture cached even after we replaced the prop's sprite_url. */
const bgTextureKeyFor = (url: string) => {
  // R2 assets are content-hashed; the final 12 hex chars of the
  // filename are plenty to disambiguate.
  const tail = url.split("/").pop() ?? url;
  const hash = tail.replace(/\.[a-z]+$/i, "").slice(-12);
  return `bg-tile-${hash}`;
};
const tilesetKeyFor = (biomeId: string, url: string) => {
  const tail = url.split("/").pop() ?? url;
  const hash = tail.replace(/\.[a-z]+$/i, "").slice(-12);
  return `tileset-${biomeId}-${hash}`;
};

export type SceneCallbacks = {
  onExitRequested?: (direction: Direction) => void;
  onNpcAdjacent?: (npcId: string | null) => void;
  /** Fired when the Z key is pressed AND the player is on / adjacent
   *  to a ground item. Passes the room_ground_items.id; React handles
   *  the /pickup API call. */
  onGroundItemPickup?: (groundItemId: string) => void;
  /** Fired when Z is pressed AND the player is adjacent to a prop
   *  whose metadata declares it interactable (chests, levers, …).
   *  React calls /interact with the prop kind + tile coordinates. */
  onPropInteract?: (propKind: string, tileX: number, tileY: number) => void;
  /** Fired when the player steps onto a tile occupied by an encounter
   *  trigger prop (metadata.encounter_id set + encounter_id NOT in
   *  player.seen_encounters). React kicks off the cutscene flow. */
  onEncounterTriggered?: (encounterId: string, mobIds: string[]) => void;
};

export type SceneInitData = { state: RoomState; callbacks?: SceneCallbacks };

export class AbyssScene extends Phaser.Scene {
  static KEY = "abyss-scene";

  private state!: RoomState;
  private callbacks: SceneCallbacks = {};
  private player?: Phaser.GameObjects.Sprite;
  private npcSprites = new Map<string, Phaser.GameObjects.Sprite>();
  /** Per-room debris that needs to die on tearDown: NPC placeholders,
   *  exit doors + halos, etc. Lifetimes are tied to the room render. */
  private roomDecor: Phaser.GameObjects.GameObject[] = [];
  private tilemap?: Phaser.Tilemaps.Tilemap;
  /** Tile cells that block movement because a colliding prop sits on them.
   *  Stored as "x,y" strings — checked in attemptMove alongside isWallCell. */
  private propBlockers = new Set<string>();
  private playerTile = { x: 0, y: 0 };
  private playerDir: Direction = "south";
  private moveCooldownMs = 0;
  private adjacentNpcId: string | null = null;
  private virtualDir: Direction | null = null;
  private playerAnimState: AnimState = "idle";
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private zKey?: Phaser.Input.Keyboard.Key;
  private booted = false;
  /** If non-null, only these directions are allowed during the tutorial.
   *  attemptMove silently ignores any other direction. */
  private allowedDirections: Set<Direction> | null = null;
  /** Item id of the ground item the player can currently grab with Z
   *  (the player is standing on or directly adjacent to). null = no
   *  pickup available right now. */
  private adjacentGroundItemId: string | null = null;
  /** Interactable prop (chest, lever, …) the player can currently
   *  trigger with Z. Detected by scanning `props` whose metadata
   *  contains an `interact` block. Same adjacency rule as ground
   *  items (own tile + 4 neighbours). */
  private adjacentInteractableProp: { kind: string; x: number; y: number } | null = null;
  /** Set by loadRoom when re-loading the SAME room (e.g. after /interact
   *  refresh). buildRoomFromState reads it once instead of map.spawn so
   *  the player doesn't snap back to the entry door. Cleared after use. */
  private preservedPlayerTile: { x: number; y: number } | null = null;
  private preservedPlayerDir: Direction | null = null;
  /** Encounter triggers in the current room. attemptMove checks this
   *  after every committed step; if the player's new tile matches a
   *  trigger AND the encounter hasn't already fired, the React
   *  callback runs (which kicks off the cutscene + combat flow).
   *  Cleared on every room rebuild. */
  private encounterTriggers: Array<{
    tile: { x: number; y: number };
    encounterId: string;
    mobIds: string[];
  }> = [];
  /** Local copy of player.seen_encounters; lets us suppress a
   *  same-session retrigger after the React callback fires but before
   *  the server-confirmed RoomState arrives. */
  private localSeenEncounters = new Set<string>();
  /** Set true while a cutscene is playing — attemptMove ignores input
   *  so the player can't walk away from the camera moment. */
  private cutsceneActive = false;
  /** mob_id → animation_atlas pending Phaser animation registration.
   *  queueAssetsForCurrentState fills this; buildRoomFromState reads
   *  it after Phaser finishes loading frame textures. */
  private pendingMobAnimations: Map<string, Record<string, Record<string, string[]>> | null> = new Map();
  /** One-shot ambient triggers — props whose metadata declares
   *  `one_shot_on_step: { x, y }` stay invisible until the player
   *  steps onto the named tile, then play their animation once
   *  and hide again. Cleared on every room rebuild (re-entering
   *  the room plays them again). */
  private oneShotTriggers: Array<{
    sprite: Phaser.GameObjects.Sprite;
    animKey: string | null;
    stepTile: { x: number; y: number };
    played: boolean;
  }> = [];

  constructor() {
    super(AbyssScene.KEY);
  }

  init(data: SceneInitData) {
    this.state = data.state;
    this.callbacks = data.callbacks ?? {};
    this.adjacentNpcId = null;
    this.npcSprites.clear();
  }

  /**
   * Pokemon-style room transition: React calls this the instant the
   * player steps onto an exit tile, so the screen fades to black while
   * the network call (and any loose tween) wraps up. The new room
   * paints under the black overlay; buildRoomFromState then fades it
   * back in. The player never sees themselves "stuck" on the door
   * tile waiting for the next room.
   */
  startFadeOut(durationMs = 200): void {
    this.cameras.main?.fadeOut(durationMs, 0, 0, 0);
  }

  preload() {
    this.queueAssetsForCurrentState();
  }

  create() {
    this.setupKeyboard();
    this.buildRoomFromState();
    this.booted = true;
  }

  /**
   * Public hot-reload entrypoint called from React when the server reports a
   * room change. Avoids `this.scene.restart(...)` because in Phaser 4 that
   * triggers a "Cannot read properties of null (reading 'sys')" cascade when
   * the destroy step races the next tick of the update loop. Instead we
   * tear down + rebuild the room *in place* on the same Scene instance,
   * keeping `this.callbacks` stable across transitions.
   */
  loadRoom(newState: RoomState) {
    // If the room id is unchanged (e.g. /interact returned a refresh
    // of the same room because the chest changed visual state), keep
    // the player exactly where they are. Otherwise buildRoomFromState
    // resets to map.spawn — which the room-state builder may have
    // pinned to the entry door if current_room_entry_dir is still
    // set from the previous /move, teleporting the player BACK to
    // the door they came in through. That was the "regresa a la
    // puerta" bug after picking up potions.
    const sameRoomReload =
      this.booted && this.state && this.state.room.id === newState.room.id;
    const preservedTile = sameRoomReload ? { ...this.playerTile } : null;
    const preservedDir = sameRoomReload ? this.playerDir : null;

    this.state = newState;
    this.adjacentNpcId = null;
    this.virtualDir = null;
    if (preservedTile) {
      // Stash so buildRoomFromState (called below via onComplete)
      // can pick the saved tile up after it would otherwise read
      // map.spawn. The variable is cleared after one use.
      this.preservedPlayerTile = preservedTile;
      this.preservedPlayerDir = preservedDir;
    }
    // Do NOT reset moveCooldownMs to 0. The exit trigger set it to
    // 1000ms; if we wipe it the user holding a keyboard arrow (which
    // ignores virtualDir clearing) auto-steps the moment the new
    // room renders, looking like "I crossed the door and walked
    // past the entry tile". Carry the cooldown over, then clamp to
    // at least 250ms so even a stale carry-over still demands a
    // beat before the next move.
    this.moveCooldownMs = Math.max(this.moveCooldownMs, 250);
    this.tearDownRoom();
    // Force-clear the React-side adjacent NPC HUD. checkNpcAdjacency below
    // only fires the callback on transition (adj !== this.adjacentNpcId),
    // so when we go from "Cedric adjacent" in the previous room to "no
    // NPC" in the new one, both sides see null and the callback never
    // fires — leaving the banner stuck. Push the reset eagerly here.
    this.callbacks.onNpcAdjacent?.(null);

    if (!this.booted) {
      // We're still inside the initial create(); the boot path will pick
      // the new state up on its own.
      return;
    }

    const queuedKeys = this.queueAssetsForCurrentState();
    let built = false;
    const onComplete = () => {
      if (built) return;
      built = true;
      this.buildRoomFromState();
    };

    const allReady = queuedKeys.every((k) => this.textures.exists(k));
    if (allReady) {
      onComplete();
    } else {
      this.load.once(Phaser.Loader.Events.COMPLETE, onComplete);
      this.load.start();
      // Safety: if any file 404s/CORS-fails Phaser may never emit
      // COMPLETE on this batch. Fall back after 5s and render with
      // whatever did land — buildRoomFromState already skips missing
      // textures gracefully. Without this the screen stayed black.
      this.time.delayedCall(5000, () => {
        if (built) return;
        const missing = queuedKeys.filter((k) => !this.textures.exists(k));
        if (missing.length > 0) {
          console.warn("[abyss/scene] loadRoom timeout — proceeding with " + missing.length + " missing textures:", missing.slice(0, 8));
        }
        onComplete();
      });
    }
  }

  /** Returns the texture keys we just queued so callers can wait until
   *  every one of them lands in the texture manager. */
  private queueAssetsForCurrentState(): string[] {
    const s = this.state;
    const queued: string[] = [];

    if (s.biome?.tileset_url && s.biome.tileset_metadata) {
      const key = tilesetKeyFor(s.biome.id, s.biome.tileset_url);
      if (!this.textures.exists(key)) {
        this.load.spritesheet(key, s.biome.tileset_url, {
          frameWidth: TILE_SIZE,
          frameHeight: TILE_SIZE,
          margin: 0,
          spacing: 0,
        });
        queued.push(key);
      }
    }

    if (s.player.sprite_atlas) {
      for (const dir of ALL_DIRECTIONS) {
        const url = s.player.sprite_atlas[dir];
        const key = `player-${dir}`;
        if (url && !this.textures.exists(key)) {
          this.load.image(key, url);
          queued.push(key);
        }
      }
    }
    queued.push(...this.queueAnimationAssets("player", s.player.animation_atlas ?? null));

    if (!this.textures.exists(DOOR_TEXTURE_KEY)) {
      this.load.image(DOOR_TEXTURE_KEY, DOOR_SPRITE_URL);
      queued.push(DOOR_TEXTURE_KEY);
    }

    // Cave background tile (server tells us the URL from props table).
    // Derive the texture key from the URL itself so swapping the asset
    // in R2 forces Phaser to load the new bytes — a hard-coded
    // "bg-tile" key would keep returning the old cached texture even
    // after we replaced the prop's sprite_url in the DB.
    if (s.background_tile_url) {
      const bgKey = bgTextureKeyFor(s.background_tile_url);
      if (!this.textures.exists(bgKey)) {
        this.load.image(bgKey, s.background_tile_url);
        queued.push(bgKey);
      }
    }

    // Map props (dragon, portal, bridge, tree, etc.) — server hydrates
    // sprite_url for each, we load once per (kind) so revisiting a room
    // hits the texture cache. Props with metadata.animation_frames also
    // queue each frame as its own texture so we can build a Phaser
    // animation later.
    for (const prop of s.props ?? []) {
      const key = propTextureKey(prop.kind);
      if (!this.textures.exists(key)) {
        this.load.image(key, prop.sprite_url);
        queued.push(key);
      }
      const frames = prop.metadata?.animation_frames as string[] | undefined;
      if (frames) {
        frames.forEach((url, i) => {
          const fk = `${propTextureKey(prop.kind)}-anim-${i}`;
          if (!this.textures.exists(fk)) {
            this.load.image(fk, url);
            queued.push(fk);
          }
        });
      }
      // Pre-queue the opened-state sprite for any prop that ships one,
      // so the swap on /interact is instant (no flicker waiting for
      // the texture to land).
      const openedUrl = prop.metadata?.opened_sprite_url as string | undefined;
      if (openedUrl) {
        const ok = `${propTextureKey(prop.kind)}-opened`;
        if (!this.textures.exists(ok)) {
          this.load.image(ok, openedUrl);
          queued.push(ok);
        }
      }
    }

    // Pre-queue cutscene mob assets if any encounter trigger in this
    // room declares mob_assets in its metadata (centaur + archer for
    // the bridge ambush). Loading here means the cutscene transition
    // is instant when the trigger fires; no perceptible "loading" beat.
    for (const prop of s.props ?? []) {
      const mobAssets = prop.metadata?.mob_assets as
        | Array<{ id: string; sprite_atlas?: Record<string, string>; animation_atlas?: Record<string, Record<string, string[]>> }>
        | undefined;
      if (!mobAssets) continue;
      for (const m of mobAssets) {
        if (m.sprite_atlas) {
          for (const dir of ALL_DIRECTIONS) {
            const url = m.sprite_atlas[dir];
            const key = `mob-${m.id}-${dir}`;
            if (url && !this.textures.exists(key)) {
              this.load.image(key, url);
              queued.push(key);
            }
          }
        }
        queued.push(...this.queueAnimationAssets(`mob-${m.id}`, m.animation_atlas ?? null));
        // Stash the atlas so buildRoomFromState can register the
        // Phaser animations after the textures land. spawnCutsceneMob
        // then plays them — previously we tried to .play() an animKey
        // that was never created, so the mob slid in without legs.
        this.pendingMobAnimations.set(m.id, m.animation_atlas ?? null);
      }
    }

    for (const npc of s.npcs) {
      if (npc.sprite_atlas) {
        for (const dir of ALL_DIRECTIONS) {
          const url = npc.sprite_atlas[dir];
          const key = `npc-${npc.id}-${dir}`;
          if (url && !this.textures.exists(key)) {
            this.load.image(key, url);
            queued.push(key);
          }
        }
      }
      queued.push(...this.queueAnimationAssets(`npc-${npc.id}`, npc.animation_atlas ?? null));
    }

    // Ground items: queue each unique item icon (from the catalog). One
    // texture per item kind, regardless of how many copies are on the
    // floor in this room.
    for (const g of s.ground_items ?? []) {
      const cat = s.item_catalog[g.item_id];
      const iconUrl = cat?.icon_path;
      if (!iconUrl) continue;
      const key = `ground-item-${g.item_id}`;
      if (!this.textures.exists(key)) {
        this.load.image(key, iconUrl);
        queued.push(key);
      }
    }
    return queued;
  }

  private queueAnimationAssets(prefix: string, atlas: AnimationAtlas | null): string[] {
    const queued: string[] = [];
    if (!atlas) return queued;
    for (const animName of ["walk", "idle"] as const) {
      const dirMap = atlas[animName];
      if (!dirMap) continue;
      for (const dir of ALL_DIRECTIONS) {
        const urls = dirMap[dir];
        if (!urls) continue;
        urls.forEach((url, i) => {
          const key = `${prefix}-${animName}-${dir}-${i}`;
          if (url && !this.textures.exists(key)) {
            this.load.image(key, url);
            queued.push(key);
          }
        });
      }
    }
    return queued;
  }

  /**
   * Register Phaser.Animation entries for each (animName × direction)
   * combination present in the atlas. Frame keys must match what
   * `queueAnimationAssets` loaded. Idempotent — re-registers only if
   * not already created.
   */
  private createAnimationsFor(prefix: string, atlas: AnimationAtlas | null) {
    if (!atlas) return;
    for (const animName of ["walk", "idle"] as const) {
      const dirMap = atlas[animName];
      if (!dirMap) continue;
      for (const dir of ALL_DIRECTIONS) {
        const urls = dirMap[dir];
        if (!urls || urls.length === 0) continue;
        const animKey = `${prefix}-${animName}-${dir}`;
        if (this.anims.exists(animKey)) continue;
        const frames = urls
          .map((_, i) => `${prefix}-${animName}-${dir}-${i}`)
          .filter((k) => this.textures.exists(k))
          .map((key) => ({ key }));
        if (frames.length === 0) continue;
        this.anims.create({
          key: animKey,
          frames,
          frameRate: ANIM_FRAMERATE,
          repeat: -1,
        });
      }
    }
  }

  private playSpriteAnim(
    sprite: Phaser.GameObjects.Sprite,
    prefix: string,
    state: AnimState,
    dir: Direction,
  ): boolean {
    const animKey = `${prefix}-${state}-${dir}`;
    if (!this.anims.exists(animKey)) return false;
    if (sprite.anims.currentAnim?.key === animKey && sprite.anims.isPlaying) return true;
    sprite.play(animKey);
    return true;
  }

  private tearDownRoom() {
    // Kill every running tween first. Halos and doors had infinite
    // yoyo alpha tweens running on themselves; destroying the target
    // without killing its tween leaves the tween dereferencing a null
    // `sys` on the next tick — that's the cascade of "Cannot read
    // properties of null (reading 'sys')" the user reported.
    this.tweens.killAll();
    this.player?.destroy();
    this.player = undefined;
    for (const sprite of this.npcSprites.values()) {
      sprite.destroy();
    }
    this.npcSprites.clear();
    for (const obj of this.roomDecor) {
      obj.destroy();
    }
    this.roomDecor = [];
    // Wipe one-shot trigger state too — re-entering a room should
    // play the fish jump (etc.) again.
    this.oneShotTriggers = [];
    // Wipe encounter trigger state — buildRoomFromState repopulates
    // from the new room's props. Hydrate the local-seen set from the
    // latest server state.
    this.encounterTriggers = [];
    this.localSeenEncounters = new Set(this.state?.player.seen_encounters ?? []);
    if (this.tilemap) {
      this.tilemap.destroy();
      this.tilemap = undefined;
    }
  }

  private setupKeyboard() {
    if (!this.input.keyboard) return;
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys("W,A,S,D") as typeof this.wasd;
    this.zKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.zKey.on("down", () => this.tryGroundPickup());
  }

  /** Called by the Z key handler. Ground items win when both a ground
   *  pickup AND a prop interact are available — picking up loose loot
   *  feels more urgent than opening a chest you can return to.
   *  Otherwise fire the interact callback for the adjacent prop. */
  private tryGroundPickup() {
    if (this.adjacentGroundItemId) {
      this.callbacks.onGroundItemPickup?.(this.adjacentGroundItemId);
      return;
    }
    if (this.adjacentInteractableProp) {
      const p = this.adjacentInteractableProp;
      this.callbacks.onPropInteract?.(p.kind, p.x, p.y);
    }
  }

  private buildRoomFromState() {
    const s = this.state;
    const map = s.room.tilemap_data;
    const meta = s.biome?.tileset_metadata;
    const tilesetKey = s.biome?.tileset_url
      ? tilesetKeyFor(s.biome.id, s.biome.tileset_url)
      : null;

    if (!map || !meta || !tilesetKey) {
      this.add.text(8, 8, "Tilemap data missing", { color: "#ff5252", fontSize: "12px" });
      return;
    }

    const tileGrid = buildTileIndexGrid(map, meta);
    this.tilemap = this.make.tilemap({
      data: tileGrid,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const ts = this.tilemap.addTilesetImage(tilesetKey, undefined, TILE_SIZE, TILE_SIZE, 0, 0);
    if (ts) {
      const layer = this.tilemap.createLayer(0, ts, 0, 0);
      if (layer) layer.setScale(ZOOM);
    }

    const mapPxW = map.width * RENDERED_TILE;
    const mapPxH = map.height * RENDERED_TILE;
    // Cave-tone background plugs any transparency in the bg tile sprite
    // — used to be near-black (#06070C) which showed through as a black
    // strip between the playable map and the cave wall halo.
    this.cameras.main.setBackgroundColor("#10131a");

    // Extend the cave visually beyond the walkable map so portrait phones
    // don't see a black void around small rooms. We carve a single
    // "upper terrain" tile out of the tileset PNG via a runtime canvas
    // texture and tile it across a huge background at low depth. The
    // camera bounds are widened to include this halo so the bg can
    // actually be on-screen — collision still keeps the player inside
    // the original mapPxW × mapPxH.
    // Cave halo: tileable mineral PNG painted around the playable map.
    // The camera's background colour (set above to #10131a) plugs any
    // transparent pixels in the tiled PNG so the user never sees
    // black between the map edge and the cave wall pattern.
    const BG_HALO_PX = 1200;
    const haloX = -BG_HALO_PX;
    const haloY = -BG_HALO_PX;
    const haloW = mapPxW + BG_HALO_PX * 2;
    const haloH = mapPxH + BG_HALO_PX * 2;
    const bgKey = s.background_tile_url ? bgTextureKeyFor(s.background_tile_url) : null;
    if (bgKey && this.textures.exists(bgKey)) {
      const bgSprite = this.add
        .tileSprite(haloX, haloY, haloW, haloH, bgKey)
        .setOrigin(0, 0)
        .setDepth(-10)
        // Source tile is 128 (v1) or 256 px (v2). 0.5 brings each
        // tile repetition to ~half its source size so mineral detail
        // reads at the natural scale of the player sprite.
        .setTileScale(0.5, 0.5);
      this.roomDecor.push(bgSprite);
    }
    this.cameras.main.setBounds(haloX, haloY, haloW, haloH);
    this.cameras.main.centerOn(mapPxW / 2, mapPxH / 2);

    // Same-room reloads (e.g. /interact returned a refresh) preserve
    // the player's actual tile + facing so they don't snap back to
    // the entry door. Cross-room transitions use map.spawn as usual.
    if (this.preservedPlayerTile) {
      this.playerTile = this.preservedPlayerTile;
      this.playerDir = this.preservedPlayerDir ?? "south";
      this.preservedPlayerTile = null;
      this.preservedPlayerDir = null;
    } else {
      this.playerTile = { ...map.spawn };
      this.playerDir = "south";
    }
    this.playerAnimState = "idle";
    this.createAnimationsFor("player", s.player.animation_atlas ?? null);
    // Register any pending cutscene mob animations now that the
    // texture frames have landed. spawnCutsceneMob expects animKey
    // `mob-${id}-walk-${dir}` to exist BEFORE it calls .play().
    for (const [mobId, atlas] of this.pendingMobAnimations) {
      this.createAnimationsFor(`mob-${mobId}`, atlas);
    }
    const playerKey = this.spriteKeyForDir("player", this.playerDir);
    if (this.textures.exists(playerKey)) {
      this.player = this.add.sprite(
        this.playerTile.x * RENDERED_TILE + RENDERED_TILE / 2,
        this.playerTile.y * RENDERED_TILE + RENDERED_TILE / 2,
        playerKey,
      );
      this.player.setScale(CHARACTER_SCALE);
      this.player.setOrigin(0.5, CHARACTER_ORIGIN_Y);
      this.player.setDepth(10);
      // Idle is INTENTIONALLY static (no breathing) per the user-validated
      // stillness rule — see feedback_static_decor_stillness.md memory +
      // commit 62cb89d. Calling setPlayerAnimState("idle", force=true)
      // resets the anim manager so any stray walk frame from the previous
      // room load is cleared and the sprite holds on its static rotation.
      this.playerAnimState = "walk"; // force the state machine to TRANSITION
      this.setPlayerAnimState("idle", true);
      // Follow the player so big maps (>10×8 tiles) don't truncate. lerp
      // smooths step-snapping so the camera glides instead of jumping.
      this.cameras.main.startFollow(this.player, true, 0.18, 0.18);
    }

    // Reset blockers ONCE before populating from NPCs + props, so they
    // accumulate together. Previously the props loop cleared *after*
    // the NPC loop had populated it, wiping Cedric/Ozyel out of the
    // blocker set and making them walk-through-able again.
    this.propBlockers.clear();

    for (const npc of s.npcs) {
      if (npc.tile_x === null || npc.tile_y === null) continue;
      // NPCs block the tile they stand on so the player can't walk
      // through Cedric / Ozyel. Adjacency detection still picks them up
      // from neighbour tiles, which is how the talk-prompt HUD triggers.
      this.propBlockers.add(`${npc.tile_x},${npc.tile_y}`);
      const prefix = `npc-${npc.id}`;
      this.createAnimationsFor(prefix, npc.animation_atlas ?? null);
      const key = `${prefix}-south`;
      const npcX = npc.tile_x * RENDERED_TILE + RENDERED_TILE / 2;
      const npcY = npc.tile_y * RENDERED_TILE + RENDERED_TILE / 2;
      if (!this.textures.exists(key)) {
        // Skip the red placeholder when the NPC intentionally has no
        // sprite_atlas (e.g. Ozyel — his body is the dragon prop).
        // The placeholder is a debug aid for the "missing texture"
        // case, where sprite_atlas IS set but the URL failed to load.
        const hasIntendedAtlas = npc.sprite_atlas && Object.values(npc.sprite_atlas).some(Boolean);
        if (hasIntendedAtlas) {
          console.warn(`[abyss/scene] NPC texture missing for ${npc.id}; key=${key} url=${npc.sprite_atlas?.south ?? "(none)"}`);
          const placeholder = this.add
            .rectangle(npcX, npcY - RENDERED_TILE / 4, RENDERED_TILE - 4, RENDERED_TILE - 4, 0xff5252, 0.85)
            .setStrokeStyle(2, 0xffffff)
            .setDepth(5);
          this.roomDecor.push(placeholder);
        }
        continue;
      }
      const sprite = this.add.sprite(npcX, npcY, key);
      sprite.setScale(CHARACTER_SCALE);
      sprite.setOrigin(0.5, CHARACTER_ORIGIN_Y);
      sprite.setDepth(5);
      this.npcSprites.set(npc.id, sprite);
      // NPCs are held on their static south-facing texture — no breathing.
      // Matches the player's idle behaviour (fully static when not moving).
    }

    // Exit markers: real arch-doorway sprite at every connection tile so
    // the player sees an unmistakable portal where each room leads.
    // We render the door over the exit tile itself (which is floor `.`
    // in the seed) so it visually "fills" the gap in the wall. A soft
    // pulsing halo behind the door draws the eye from across the map.
    // Map props: paint each one over its tile with the right depth and
    // add collidable ones to the blocker set (already cleared+populated
    // by the NPC loop above; we just append here).
    const openedProps = new Set(s.player.opened_props ?? []);
    for (const prop of s.props ?? []) {
      // If the prop has been opened by THIS character AND it ships an
      // `opened_sprite_url` in metadata, swap to the opened texture.
      // Z interact also gets suppressed below (checkGroundAdjacency).
      const propKey = `${s.room.id}:${prop.kind}:${prop.x}:${prop.y}`;
      const isOpened = openedProps.has(propKey);
      const hasOpenedSprite = !!(prop.metadata?.opened_sprite_url as string | undefined);
      const baseKey = propTextureKey(prop.kind);
      const key = isOpened && hasOpenedSprite ? `${baseKey}-opened` : baseKey;
      if (!this.textures.exists(key)) continue;
      const cx = prop.x * RENDERED_TILE + RENDERED_TILE / 2;
      const cy = prop.y * RENDERED_TILE + RENDERED_TILE / 2;
      const animFrames = prop.metadata?.animation_frames as string[] | undefined;
      const animFramerate = (prop.metadata?.animation_framerate as number | undefined) ?? 6;
      // Ambient one-shots stay invisible until the player steps on
      // the trigger tile, then play once. The fish-jump-on-bridge in
      // r02 is the canonical case.
      const oneShotStep = prop.metadata?.one_shot_on_step as { x: number; y: number } | undefined;
      // Use Sprite (not Image) when we either have animation frames OR
      // a one-shot trigger — one-shots need .setVisible() + may run a
      // tween-only fallback (no frames). Image is only used for purely
      // static decor.
      const useSprite = !!animFrames || !!oneShotStep;
      const obj = useSprite
        ? this.add.sprite(cx, cy, key)
        : this.add.image(cx, cy, key);
      // Per-prop anchor: the bridge sits flat across its tile so the
      // sprite is centered on (0.5, 0.5); tall world objects (trees,
      // dragon, portal) anchor at (0.5, 0.7) so the base of the sprite
      // is roughly on the tile while the body rises upward.
      const isFlat = prop.kind === "cave_bridge_stone" || prop.kind === "cave_river";
      obj
        .setOrigin(0.5, isFlat ? 0.5 : 0.7)
        .setScale(prop.display_scale ?? 1.0)
        // Bridge + river sit BELOW the player (depth 1) so the player
        // walks over them. Trees, dragon, portal are at depth 4.
        .setDepth(isFlat ? 1 : 4);
      this.roomDecor.push(obj);
      if (prop.collision) {
        this.propBlockers.add(`${prop.x},${prop.y}`);
      }
      // Optional Phaser.Animation registration — only when frames exist.
      let registeredAnimKey: string | null = null;
      if (useSprite && animFrames) {
        const animKey = `prop-anim-${prop.kind}`;
        // One-shot animations are NON-LOOPING; everything else loops
        // forever (river ripple, torch flicker, dragon idle).
        const repeat = oneShotStep ? 0 : -1;
        if (!this.anims.exists(animKey)) {
          const frameRefs = animFrames
            .map((_, i) => ({ key: `${key}-anim-${i}` }))
            .filter((f) => this.textures.exists(f.key));
          if (frameRefs.length > 0) {
            this.anims.create({
              key: animKey,
              frames: frameRefs,
              frameRate: animFramerate,
              repeat,
            });
          }
        }
        if (this.anims.exists(animKey)) registeredAnimKey = animKey;
      }

      if (oneShotStep) {
        // ALWAYS hide one-shot props on spawn (even when no animation
        // frames exist) and register the trigger. tryOneShotTriggers,
        // called from attemptMove, will reveal + play / tween + hide
        // when the player steps onto the trigger tile.
        (obj as Phaser.GameObjects.Sprite).setVisible(false);
        this.oneShotTriggers.push({
          sprite: obj as Phaser.GameObjects.Sprite,
          animKey: registeredAnimKey,
          stepTile: { x: oneShotStep.x, y: oneShotStep.y },
          played: false,
        });
      } else if (registeredAnimKey) {
        (obj as Phaser.GameObjects.Sprite).play(registeredAnimKey);
      }

      // Invisible encounter triggers: drop the sprite, just register
      // tile + encounter_id + mob_ids for tryEncounterTrigger to fire
      // when the player steps on. metadata.invisible_trigger flags the
      // entry; collision stays false so the player can walk onto it.
      const encounterId = prop.metadata?.encounter_id as string | undefined;
      if (prop.metadata?.invisible_trigger || encounterId) {
        obj.setVisible(false);
      }
      if (encounterId) {
        const mobIds = (prop.metadata?.mob_ids as string[] | undefined) ?? [];
        this.encounterTriggers.push({
          tile: { x: prop.x, y: prop.y },
          encounterId,
          mobIds,
        });
      }
      if (prop.kind === "portal_hyperdimensional") {
        // Soft halo behind the sprite to widen its presence; the sprite
        // itself now carries its own swirl animation so we no longer
        // need a fake angle tween.
        const halo = this.add
          .circle(cx, cy, RENDERED_TILE * 0.9, 0x9d6cff, 0.28)
          .setDepth(3);
        this.roomDecor.push(halo);
        this.tweens.add({
          targets: halo,
          alpha: { from: 0.42, to: 0.14 },
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
    }

    // Ground items: render each loose item as a sprite with a soft
    // elliptical shadow underneath + a gentle bobbing tween so it
    // reads as "lying on the floor, please pick me up". The shadow
    // is depth 1 (below the player), the item sprite at depth 3.
    for (const g of s.ground_items ?? []) {
      const key = `ground-item-${g.item_id}`;
      if (!this.textures.exists(key)) continue;
      const cx = g.x * RENDERED_TILE + RENDERED_TILE / 2;
      const cy = g.y * RENDERED_TILE + RENDERED_TILE / 2;
      // Shadow first, so the item sits on top of it.
      const shadow = this.add
        .ellipse(cx, cy + RENDERED_TILE * 0.18, RENDERED_TILE * 0.55, RENDERED_TILE * 0.18, 0x000000, 0.55)
        .setDepth(1);
      this.roomDecor.push(shadow);
      // Item sprite, with a bobbing y tween. Each ground item gets its
      // own tween so a room with multiple drops doesn't sync them.
      // Depth 5: above tall props (depth 4 — trees, stepping stones,
      // statues) but below NPCs (depth 5 they share) and the player
      // (depth 10). 4.5 would be ideal but Phaser sorts integers fine
      // with 5; the sword visually pops above stepping stones now.
      const sprite = this.add
        .image(cx, cy, key)
        .setOrigin(0.5, 0.5)
        .setScale(0.7)
        .setDepth(5);
      this.roomDecor.push(sprite);
      const baseY = cy - RENDERED_TILE * 0.05;
      sprite.y = baseY;
      this.tweens.add({
        targets: sprite,
        y: { from: baseY - 2, to: baseY + 2 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // Server-side connections are the source of truth. If the client's
    // cached tilemap_data has an exit cell that the server doesn't have
    // a connection for, we silently ignore it — no door, no exit
    // trigger. This is what was producing "no hay paso por ahí" right
    // after spawn: stale tilemap with phantom exits.
    const validExitDirs = new Set(s.connections.map((c) => c.direction));
    if (this.textures.exists(DOOR_TEXTURE_KEY)) {
      for (const [dirRaw, exit] of Object.entries(map.exits)) {
        if (!exit) continue;
        if (!validExitDirs.has(dirRaw as Direction)) continue;
        const cx = exit.x * RENDERED_TILE + RENDERED_TILE / 2;
        const cy = exit.y * RENDERED_TILE + RENDERED_TILE / 2;
        // Stone arch: scale 1.0 so the 64px source displays at ~64px,
        // slightly bigger than the 48px tile so the arch base overlaps
        // the adjacent wall tiles — reads as "carved INTO the rock",
        // not "object floating in front of it". No halo, no bobbing —
        // Pokemon cave entrances are silent stone, the visual contrast
        // (dark opening in lighter stone) is what marks it as an exit.
        const door = this.add
          .image(cx, cy, DOOR_TEXTURE_KEY)
          .setOrigin(0.5, 0.5)
          .setScale(1.0)
          .setDepth(7);
        this.roomDecor.push(door);
      }
    }

    this.adjacentNpcId = null;
    this.adjacentGroundItemId = null;
    this.checkNpcAdjacency();
    this.checkGroundAdjacency();

    // If the scene already booted, this is a room transition — fade
    // the new room in from black. The matching fadeOut was kicked
    // off by React's doMove() the moment the exit step committed,
    // so the network round-trip was hidden under the black overlay.
    // Cold spawn (booted=false) keeps the canvas immediately visible.
    if (this.booted) {
      this.cameras.main?.fadeIn(200, 0, 0, 0);
    }
  }

  override update(_time: number, delta: number) {
    if (!this.player || !this.state.room.tilemap_data) return;
    this.moveCooldownMs -= delta;
    if (this.moveCooldownMs > 0) return;

    let dir: Direction | null = this.virtualDir;
    if (!dir && this.cursors) {
      if (this.cursors.up.isDown || this.wasd?.W.isDown) dir = "north";
      else if (this.cursors.down.isDown || this.wasd?.S.isDown) dir = "south";
      else if (this.cursors.left.isDown || this.wasd?.A.isDown) dir = "west";
      else if (this.cursors.right.isDown || this.wasd?.D.isDown) dir = "east";
    }

    if (dir) {
      this.attemptMove(dir);
    } else if (this.playerAnimState !== "idle") {
      // No movement input + cooldown done → drop back to idle. We only
      // touch the anim state when transitioning so we don't restart an
      // already-looping idle every frame.
      this.setPlayerAnimState("idle");
    }
  }

  /** Public hook the React D-pad calls. Set the desired direction;
   *  cleared automatically after one move tick. */
  setVirtualDirection(dir: Direction | null) {
    this.virtualDir = dir;
  }

  /** Same as a virtual press but a one-shot — call once per tap.
   *
   *  Must respect `moveCooldownMs` the same way `update()` does. Without
   *  the check, rapid mobile D-pad taps spam `attemptMove`, which kills
   *  + restarts the player tween on every call. On mobile WebView the
   *  tween thrashing + state updates cascade visibly as walking lag;
   *  on PC the CPU just eats it. Throttling matches hold-to-walk
   *  behaviour, which is what rapid taps imply anyway. */
  pressDirectionOnce(dir: Direction) {
    if (!this.player || !this.state.room.tilemap_data) return;
    if (this.moveCooldownMs > 0) return;
    this.attemptMove(dir);
  }

  private spriteKeyForDir(prefix: "player" | string, dir: Direction): string {
    if (prefix === "player") return `player-${dir}`;
    return `${prefix}-${dir}`;
  }

  private setPlayerFacing(dir: Direction) {
    if (this.playerDir === dir || !this.player) return;
    this.playerDir = dir;
    const key = this.spriteKeyForDir("player", dir);
    if (this.textures.exists(key)) this.player.setTexture(key);
    // Re-evaluate the current anim state in the new direction so the
    // sprite doesn't keep playing the OLD direction's frames. For
    // lateral idle this snaps the sprite still (see setPlayerAnimState).
    this.setPlayerAnimState(this.playerAnimState, true);
  }

  private setPlayerAnimState(state: AnimState, force = false) {
    if (!this.player) return;
    if (!force && this.playerAnimState === state) return;
    this.playerAnimState = state;
    // Idle is fully static — the breathing motion reads as the
    // character "shivering" / "dancing" in every direction. Player
    // only animates while actually moving.
    if (state === "idle") {
      this.player.anims.stop();
      const key = this.spriteKeyForDir("player", this.playerDir);
      if (this.textures.exists(key)) this.player.setTexture(key);
      return;
    }
    this.playSpriteAnim(this.player, "player", state, this.playerDir);
  }

  private attemptMove(dir: Direction) {
    const map = this.state.room.tilemap_data;
    if (!map) return;

    // Freeze input during cutscenes (enemy walk-in, future combat
    // transitions) so the player can't drift mid-camera-moment.
    if (this.cutsceneActive) {
      this.setPlayerAnimState("idle");
      return;
    }

    // Tutorial gating: if React has narrowed the allowed direction set
    // (e.g. only south during walk_to_cedric), silently ignore other
    // directions. The player can still turn-in-place via setPlayerFacing
    // below — they just can't commit a step.
    if (this.allowedDirections && !this.allowedDirections.has(dir)) {
      this.setPlayerAnimState("idle");
      return;
    }

    if (this.playerDir !== dir) {
      this.setPlayerFacing(dir);
    }

    const dx = dir === "east" ? 1 : dir === "west" ? -1 : 0;
    const dy = dir === "south" ? 1 : dir === "north" ? -1 : 0;
    const nx = this.playerTile.x + dx;
    const ny = this.playerTile.y + dy;

    if (isWallCell(map, nx, ny) || this.propBlockers.has(`${nx},${ny}`)) {
      this.moveCooldownMs = TURN_COOLDOWN_MS;
      this.setPlayerAnimState("idle");
      return;
    }

    // Commit the step — always with the same smooth slide tween so the
    // exit step doesn't read as a sudden jump versus normal steps.
    this.playerTile = { x: nx, y: ny };
    const targetX = nx * RENDERED_TILE + RENDERED_TILE / 2;
    const targetY = ny * RENDERED_TILE + RENDERED_TILE / 2;
    if (this.player) {
      this.tweens.killTweensOf(this.player);
      this.tweens.add({
        targets: this.player,
        x: targetX,
        y: targetY,
        duration: MOVE_TWEEN_MS,
        ease: "Linear",
      });
    }
    this.setPlayerAnimState("walk");
    this.checkNpcAdjacency();
    this.checkGroundAdjacency();
    this.tryOneShotTriggers();
    this.tryEncounterTrigger();

    // Did we land on an exit tile? If so, fire the transition trigger.
    // React-side doMove awaits at least MOVE_TWEEN_MS before calling
    // loadRoom, so the tween completes (player visibly arrives at the
    // door) before the new room paints — no more half-step + teleport.
    const validExitDirs = new Set(this.state.connections.map((c) => c.direction));
    for (const [exitDirRaw, exit] of Object.entries(map.exits)) {
      if (!exit) continue;
      if (!validExitDirs.has(exitDirRaw as Direction)) continue;
      if (this.playerTile.x === exit.x && this.playerTile.y === exit.y) {
        this.moveCooldownMs = 1000;
        this.callbacks.onExitRequested?.(exitDirRaw as Direction);
        return;
      }
    }
    this.moveCooldownMs = MOVE_COOLDOWN_MS;
  }

  private checkNpcAdjacency() {
    let adj: string | null = null;
    for (const npc of this.state.npcs) {
      if (npc.tile_x === null || npc.tile_y === null) continue;
      const dx = Math.abs(npc.tile_x - this.playerTile.x);
      const dy = Math.abs(npc.tile_y - this.playerTile.y);
      if (dx + dy <= 1) {
        adj = npc.id;
        break;
      }
    }
    if (adj !== this.adjacentNpcId) {
      this.adjacentNpcId = adj;
      this.callbacks.onNpcAdjacent?.(adj);
    }
  }

  /** Update which ground item the player can grab with Z right now.
   *  "Adjacent" includes the player's own tile (stepping on the item
   *  also picks it up). */
  private checkGroundAdjacency() {
    let adj: string | null = null;
    for (const g of this.state.ground_items ?? []) {
      const dx = Math.abs(g.x - this.playerTile.x);
      const dy = Math.abs(g.y - this.playerTile.y);
      if (dx + dy <= 1) {
        adj = g.id;
        break;
      }
    }
    this.adjacentGroundItemId = adj;

    // Same scan for interactable props. We can't walk *onto* a chest
    // (collision=true), so neighbours-only is the realistic case, but
    // dx+dy<=1 keeps it symmetrical with the pickup rule above.
    // ALREADY-OPENED props are skipped so the Z prompt doesn't lie
    // about being able to interact with a chest that's empty.
    const openedSet = new Set(this.state.player.opened_props ?? []);
    let prop: { kind: string; x: number; y: number } | null = null;
    for (const p of this.state.props ?? []) {
      const interact = (p.metadata as { interact?: unknown } | null)?.interact;
      if (!interact) continue;
      const key = `${this.state.room.id}:${p.kind}:${p.x}:${p.y}`;
      if (openedSet.has(key)) continue;
      const dx = Math.abs(p.x - this.playerTile.x);
      const dy = Math.abs(p.y - this.playerTile.y);
      if (dx + dy <= 1) {
        prop = { kind: p.kind, x: p.x, y: p.y };
        break;
      }
    }
    this.adjacentInteractableProp = prop;
  }

  /** React calls this with the set of directions allowed by the
   *  current tutorial step. Pass null (default) for free play. */
  setAllowedDirections(dirs: Set<Direction> | null) {
    this.allowedDirections = dirs;
  }

  /** React calls this to query whether the player can pick something
   *  up right now — used to render the "Z to pick up" HUD prompt. */
  getAdjacentGroundItemId(): string | null {
    return this.adjacentGroundItemId;
  }

  /** React calls this to know if a "Z to open" / "Z to interact" HUD
   *  prompt should render for the current adjacent prop. */
  getAdjacentInteractableProp(): { kind: string; x: number; y: number } | null {
    return this.adjacentInteractableProp;
  }

  /** React toggles this when the cutscene controller takes over — for
   *  the duration the scene ignores movement input + camera shakes. */
  setCutsceneActive(active: boolean) {
    this.cutsceneActive = active;
    if (active) this.setPlayerAnimState("idle");
  }

  /** Mark an encounter as seen client-side so a same-session retrigger
   *  can't fire before the server-confirmed RoomState arrives. */
  markEncounterSeen(encounterId: string) {
    this.localSeenEncounters.add(encounterId);
  }

  /** Spawn one cutscene mob at a starting tile, walk it toward a
   *  target tile playing the walk animation in the chosen direction,
   *  then settle on the south-facing idle. Returns a Promise that
   *  resolves when the mob reaches its target. */
  spawnCutsceneMob(opts: {
    mobId: string;
    fromTile: { x: number; y: number };
    toTile: { x: number; y: number };
    walkDir: Direction;
    finalDir: Direction;
    durationMs?: number;
  }): Promise<Phaser.GameObjects.Sprite | null> {
    const { mobId, fromTile, toTile, walkDir, finalDir } = opts;
    const duration = opts.durationMs ?? 1400;
    const key = `mob-${mobId}-${walkDir}`;
    if (!this.textures.exists(key)) return Promise.resolve(null);
    const startX = fromTile.x * RENDERED_TILE + RENDERED_TILE / 2;
    const startY = fromTile.y * RENDERED_TILE + RENDERED_TILE / 2;
    const targetX = toTile.x * RENDERED_TILE + RENDERED_TILE / 2;
    const targetY = toTile.y * RENDERED_TILE + RENDERED_TILE / 2;
    const sprite = this.add.sprite(startX, startY, key);
    sprite.setScale(CHARACTER_SCALE).setOrigin(0.5, CHARACTER_ORIGIN_Y).setDepth(9);
    this.roomDecor.push(sprite);
    // Play walk animation if we have frames; otherwise just slide.
    const animKey = `mob-${mobId}-walk-${walkDir}`;
    if (this.anims.exists(animKey)) sprite.play(animKey);
    return new Promise((resolve) => {
      this.tweens.add({
        targets: sprite,
        x: targetX,
        y: targetY,
        duration,
        ease: "Linear",
        onComplete: () => {
          // Switch to the final-direction static idle frame.
          const finalKey = `mob-${mobId}-${finalDir}`;
          if (this.textures.exists(finalKey)) {
            sprite.anims.stop();
            sprite.setTexture(finalKey);
          }
          resolve(sprite);
        },
      });
    });
  }

  private tryEncounterTrigger() {
    if (this.cutsceneActive) return;
    for (const trig of this.encounterTriggers) {
      if (this.localSeenEncounters.has(trig.encounterId)) continue;
      if (
        trig.tile.x !== this.playerTile.x ||
        trig.tile.y !== this.playerTile.y
      ) {
        continue;
      }
      // Mark locally to suppress double-fire in case React doesn't
      // get the RoomState refresh back before the next move.
      this.localSeenEncounters.add(trig.encounterId);
      this.cutsceneActive = true;
      this.callbacks.onEncounterTriggered?.(trig.encounterId, trig.mobIds);
      return; // one encounter per step
    }
  }

  /** Called after every committed step. For each registered one-shot
   *  ambient trigger whose stepTile matches the player's new tile,
   *  show + play its animation once, then hide on completion.
   *  Marked `played` so re-stepping on the same tile within the same
   *  visit doesn't re-fire it (only re-entering the room resets). */
  private tryOneShotTriggers() {
    for (const trig of this.oneShotTriggers) {
      if (trig.played) continue;
      if (trig.stepTile.x !== this.playerTile.x || trig.stepTile.y !== this.playerTile.y) {
        continue;
      }
      trig.played = true;
      trig.sprite.setVisible(true);
      if (trig.animKey) {
        // Phaser fires 'animationcomplete' once because repeat=0.
        trig.sprite.once("animationcomplete", () => {
          trig.sprite.setVisible(false);
        });
        trig.sprite.play(trig.animKey);
      } else {
        // No animation frames registered — fake a leap: jump up
        // (scale + y) while fading in, peak, then drop + fade out.
        // Reads as a fish breaching the surface and falling back.
        const baseY = trig.sprite.y;
        const baseScale = trig.sprite.scaleX;
        trig.sprite.setAlpha(0).setScale(baseScale * 0.7);
        this.tweens.add({
          targets: trig.sprite,
          y: { from: baseY + 8, to: baseY - 20 },
          scaleX: { from: baseScale * 0.7, to: baseScale * 1.05 },
          scaleY: { from: baseScale * 0.7, to: baseScale * 1.05 },
          alpha: { from: 0, to: 1 },
          duration: 380,
          ease: "Quad.easeOut",
          onComplete: () => {
            this.tweens.add({
              targets: trig.sprite,
              y: baseY + 8,
              scaleX: baseScale * 0.65,
              scaleY: baseScale * 0.65,
              alpha: 0,
              duration: 320,
              ease: "Quad.easeIn",
              onComplete: () => {
                trig.sprite.setVisible(false);
                // Reset for hygiene — if the trigger ever re-fires
                // (it won't this visit because `played=true`, but be
                // defensive) the sprite starts from a known state.
                trig.sprite.setY(baseY).setScale(baseScale).setAlpha(1);
              },
            });
          },
        });
      }
    }
  }
}
