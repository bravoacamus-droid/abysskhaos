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
 * Frames-per-second for walk + idle. PixelLab walk-4-frames animations
 * read naturally around 8fps (matches the 4-frame leg cycle felt in
 * Pokemon / Chrono Trigger overworld). Idle breathing is slower visually
 * but using the same FPS keeps the loop tight against the grid step.
 */
const ANIM_FRAMERATE = 8;
const ALL_DIRECTIONS: Direction[] = ["south", "north", "east", "west"];
type AnimState = "walk" | "idle";

/**
 * The original door arch is still used to mark every room exit. It's
 * generated once per session and looked up by hardcoded URL; the rest
 * of the prop catalogue (dragon, bridge, tree, portal) now travels in
 * state.props with its own sprite URL.
 */
const DOOR_SPRITE_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/a83a12cc6eabab1d40ff3403ce9515cbcb2d39aee30eeddc61134923fcf8cf31.png";
const DOOR_TEXTURE_KEY = "prop-door-threshold";
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

export type SceneCallbacks = {
  onExitRequested?: (direction: Direction) => void;
  onNpcAdjacent?: (npcId: string | null) => void;
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
  private booted = false;

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
    this.state = newState;
    this.adjacentNpcId = null;
    this.virtualDir = null;
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
      const key = `tileset-${s.biome.id}`;
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
    if (this.tilemap) {
      this.tilemap.destroy();
      this.tilemap = undefined;
    }
  }

  private setupKeyboard() {
    if (!this.input.keyboard) return;
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys("W,A,S,D") as typeof this.wasd;
  }

  private buildRoomFromState() {
    const s = this.state;
    const map = s.room.tilemap_data;
    const meta = s.biome?.tileset_metadata;
    const tilesetKey = s.biome ? `tileset-${s.biome.id}` : null;

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

    this.playerTile = { ...map.spawn };
    this.playerDir = "south";
    this.playerAnimState = "idle";
    this.createAnimationsFor("player", s.player.animation_atlas ?? null);
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
      // Kick the idle loop immediately if frames are present; otherwise the
      // static rotation texture set above is the fallback.
      this.playSpriteAnim(this.player, "player", "idle", this.playerDir);
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
      this.playSpriteAnim(sprite, prefix, "idle", "south");
    }

    // Exit markers: real arch-doorway sprite at every connection tile so
    // the player sees an unmistakable portal where each room leads.
    // We render the door over the exit tile itself (which is floor `.`
    // in the seed) so it visually "fills" the gap in the wall. A soft
    // pulsing halo behind the door draws the eye from across the map.
    // Map props: paint each one over its tile with the right depth and
    // add collidable ones to the blocker set (already cleared+populated
    // by the NPC loop above; we just append here).
    for (const prop of s.props ?? []) {
      const key = propTextureKey(prop.kind);
      if (!this.textures.exists(key)) continue;
      const cx = prop.x * RENDERED_TILE + RENDERED_TILE / 2;
      const cy = prop.y * RENDERED_TILE + RENDERED_TILE / 2;
      const animFrames = prop.metadata?.animation_frames as string[] | undefined;
      const animFramerate = (prop.metadata?.animation_framerate as number | undefined) ?? 6;
      // Use Sprite (not Image) when we have animation frames so we can
      // play Phaser.Animation; Image is fine for static decor.
      const useSprite = !!animFrames;
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
      if (useSprite && animFrames) {
        const animKey = `prop-anim-${prop.kind}`;
        if (!this.anims.exists(animKey)) {
          const frameRefs = animFrames
            .map((_, i) => ({ key: `${key}-anim-${i}` }))
            .filter((f) => this.textures.exists(f.key));
          if (frameRefs.length > 0) {
            this.anims.create({
              key: animKey,
              frames: frameRefs,
              frameRate: animFramerate,
              repeat: -1,
            });
          }
        }
        if (this.anims.exists(animKey)) {
          (obj as Phaser.GameObjects.Sprite).play(animKey);
        }
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
        const halo = this.add
          .circle(cx, cy, RENDERED_TILE * 0.7, 0xb88cff, 0.22)
          .setDepth(6);
        const door = this.add
          .image(cx, cy, DOOR_TEXTURE_KEY)
          .setOrigin(0.5, 0.5)
          .setScale(0.7)
          .setDepth(7);
        this.roomDecor.push(halo, door);
        this.tweens.add({
          targets: halo,
          alpha: { from: 0.28, to: 0.12 },
          duration: 1100,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
        this.tweens.add({
          targets: door,
          y: { from: cy - 1, to: cy + 1 },
          duration: 1400,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
    }

    this.adjacentNpcId = null;
    this.checkNpcAdjacency();

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

  /** Same as a virtual press but a one-shot — call once per tap. */
  pressDirectionOnce(dir: Direction) {
    if (!this.player || !this.state.room.tilemap_data) return;
    this.attemptMove(dir);
  }

  private spriteKeyForDir(prefix: "player" | string, dir: Direction): string {
    if (prefix === "player") return `player-${dir}`;
    return `${prefix}-${dir}`;
  }

  private setPlayerFacing(dir: Direction) {
    if (this.playerDir === dir || !this.player) return;
    this.playerDir = dir;
    const animPlayed = this.playSpriteAnim(this.player, "player", this.playerAnimState, dir);
    if (!animPlayed) {
      // Fallback: no animation registered for this direction → swap the
      // static rotation texture so the player at least faces the new way.
      const key = this.spriteKeyForDir("player", dir);
      if (this.textures.exists(key)) this.player.setTexture(key);
    }
  }

  private setPlayerAnimState(state: AnimState) {
    if (this.playerAnimState === state || !this.player) return;
    this.playerAnimState = state;
    this.playSpriteAnim(this.player, "player", state, this.playerDir);
  }

  private attemptMove(dir: Direction) {
    const map = this.state.room.tilemap_data;
    if (!map) return;

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
}
