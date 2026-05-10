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
const MOVE_COOLDOWN_MS = 180;
const TURN_COOLDOWN_MS = 80;
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
 * Static map prop sprites generated through PixelLab and uploaded to R2.
 * Until we have a `props` table in the DB, hardcoding the URL keeps the
 * scene self-contained. When we add more (anvil, chest, spiral_stair),
 * we'll move this into a server-side table and ship it through the
 * /room endpoint.
 */
const DOOR_SPRITE_URL =
  "https://pub-6150fe1a62654996b1c27b5f5592904a.r2.dev/assets/a83a12cc6eabab1d40ff3403ce9515cbcb2d39aee30eeddc61134923fcf8cf31.png";
const DOOR_TEXTURE_KEY = "prop-door-threshold";

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
    this.moveCooldownMs = 0;
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
    const onComplete = () => this.buildRoomFromState();

    // Old check (`totalToLoad - totalComplete <= 0`) raced when Phaser's
    // loader auto-started newly-queued items before we could subscribe
    // to COMPLETE — the early branch would fire before all textures
    // existed, leaving Cedric (or any new NPC) without a texture and
    // showing the red placeholder. Source-of-truth is whether every
    // key we just queued already exists in the texture manager: if
    // yes, render immediately; if not, wait for COMPLETE.
    const allReady = queuedKeys.every((k) => this.textures.exists(k));
    if (allReady) {
      onComplete();
    } else {
      this.load.once(Phaser.Loader.Events.COMPLETE, onComplete);
      this.load.start();
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
    this.player?.destroy();
    this.player = undefined;
    for (const sprite of this.npcSprites.values()) {
      sprite.destroy();
    }
    this.npcSprites.clear();
    // Doors, halos, NPC placeholder rectangles and any other per-room
    // decoration. Without this, things like the red Cedric placeholder
    // bled into rooms where Cedric isn't present.
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
    this.cameras.main.setBackgroundColor("#06070C");
    // Bound the camera to the map so when the player walks toward a
    // corner the camera stops at the edge instead of revealing the void
    // beyond. setBounds + startFollow with lerp gives a Pokemon-feel
    // soft chase without overshoot.
    this.cameras.main.setBounds(0, 0, mapPxW, mapPxH);
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

    for (const npc of s.npcs) {
      if (npc.tile_x === null || npc.tile_y === null) continue;
      const prefix = `npc-${npc.id}`;
      this.createAnimationsFor(prefix, npc.animation_atlas ?? null);
      const key = `${prefix}-south`;
      const npcX = npc.tile_x * RENDERED_TILE + RENDERED_TILE / 2;
      const npcY = npc.tile_y * RENDERED_TILE + RENDERED_TILE / 2;
      if (!this.textures.exists(key)) {
        console.warn(`[abyss/scene] NPC texture missing for ${npc.id}; key=${key} url=${npc.sprite_atlas?.south ?? "(none)"}`);
        const placeholder = this.add
          .rectangle(npcX, npcY - RENDERED_TILE / 4, RENDERED_TILE - 4, RENDERED_TILE - 4, 0xff5252, 0.85)
          .setStrokeStyle(2, 0xffffff)
          .setDepth(5);
        this.roomDecor.push(placeholder);
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

    // Update facing on every press — taps shouldn't require a separate
    // "turn" step before moving. Pokemon-style turn-only behaviour was
    // confusing on a D-pad where each tap is its own intent.
    if (this.playerDir !== dir) {
      this.setPlayerFacing(dir);
    }

    const dx = dir === "east" ? 1 : dir === "west" ? -1 : 0;
    const dy = dir === "south" ? 1 : dir === "north" ? -1 : 0;
    const nx = this.playerTile.x + dx;
    const ny = this.playerTile.y + dy;

    // Exit detection: stepping ON the exit tile triggers transition.
    // Only honour exits whose direction has a real DB connection, so a
    // stale client-side tilemap can't trigger a server-side NO_EXIT 409.
    const validExitDirs = new Set(this.state.connections.map((c) => c.direction));
    for (const [exitDirRaw, exit] of Object.entries(map.exits)) {
      if (!exit) continue;
      if (!validExitDirs.has(exitDirRaw as Direction)) continue;
      if (nx === exit.x && ny === exit.y) {
        this.callbacks.onExitRequested?.(exitDirRaw as Direction);
        this.moveCooldownMs = 600;
        return;
      }
    }

    // Wall — already turned. Bumping into a wall is "not moving"; let the
    // sprite settle into idle so we don't show a walk cycle while stuck.
    if (isWallCell(map, nx, ny)) {
      this.moveCooldownMs = TURN_COOLDOWN_MS;
      this.setPlayerAnimState("idle");
      return;
    }

    // Free tile — commit the step.
    this.playerTile = { x: nx, y: ny };
    if (this.player) {
      this.player.x = nx * RENDERED_TILE + RENDERED_TILE / 2;
      this.player.y = ny * RENDERED_TILE + RENDERED_TILE / 2;
    }
    this.setPlayerAnimState("walk");
    this.moveCooldownMs = MOVE_COOLDOWN_MS;
    this.checkNpcAdjacency();
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
