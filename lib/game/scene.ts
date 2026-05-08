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

import type { Direction, RoomState } from "@/lib/client/api";
import { buildTileIndexGrid, isWallCell } from "./wang";

export const TILE_SIZE = 16;
export const ZOOM = 2;
const RENDERED_TILE = TILE_SIZE * ZOOM;
const MOVE_COOLDOWN_MS = 180;
const TURN_COOLDOWN_MS = 80;

export type SceneEvents = {
  "npc-adjacent": (data: { npcId: string | null }) => void;
  "exit-requested": (data: { direction: Direction }) => void;
};

export class AbyssScene extends Phaser.Scene {
  static KEY = "abyss-scene";

  private state!: RoomState;
  private player?: Phaser.GameObjects.Sprite;
  private npcSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private playerTile = { x: 0, y: 0 };
  private playerDir: Direction = "south";
  private moveCooldownMs = 0;
  private adjacentNpcId: string | null = null;
  private virtualDir: Direction | null = null;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };

  constructor() {
    super(AbyssScene.KEY);
  }

  init(data: { state: RoomState }) {
    this.state = data.state;
    this.adjacentNpcId = null;
    this.npcSprites.clear();
  }

  preload() {
    const s = this.state;

    if (s.biome?.tileset_url && s.biome.tileset_metadata) {
      const dims = s.biome.tileset_metadata.tileset_image.dimensions;
      // Use a unique key per biome so multiple biomes can coexist if loaded.
      this.load.spritesheet(`tileset-${s.biome.id}`, s.biome.tileset_url, {
        frameWidth: TILE_SIZE,
        frameHeight: TILE_SIZE,
        margin: 0,
        spacing: 0,
      });
      // Just for clarity — log size mismatch warnings would go here.
      void dims;
    }

    if (s.player.sprite_atlas) {
      for (const dir of ["south", "north", "east", "west"] as const) {
        const url = s.player.sprite_atlas[dir];
        if (url) this.load.image(`player-${dir}`, url);
      }
    }

    for (const npc of s.npcs) {
      if (!npc.sprite_atlas) continue;
      for (const dir of ["south", "north", "east", "west"] as const) {
        const url = npc.sprite_atlas[dir];
        if (url) this.load.image(`npc-${npc.id}-${dir}`, url);
      }
    }
  }

  create() {
    const s = this.state;
    const map = s.room.tilemap_data;
    const meta = s.biome?.tileset_metadata;
    const tilesetKey = s.biome ? `tileset-${s.biome.id}` : null;

    if (!map || !meta || !tilesetKey) {
      // Bail early — let React show an error overlay instead.
      this.add.text(8, 8, "Tilemap data missing", { color: "#ff5252", fontSize: "12px" });
      return;
    }

    const tileGrid = buildTileIndexGrid(map, meta);
    const tilemap = this.make.tilemap({
      data: tileGrid,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const ts = tilemap.addTilesetImage(tilesetKey, undefined, TILE_SIZE, TILE_SIZE, 0, 0);
    if (ts) {
      const layer = tilemap.createLayer(0, ts, 0, 0);
      if (layer) layer.setScale(ZOOM);
    }

    // Camera: center on map.
    const mapPxW = map.width * RENDERED_TILE;
    const mapPxH = map.height * RENDERED_TILE;
    this.cameras.main.setBackgroundColor("#06070C");
    this.cameras.main.centerOn(mapPxW / 2, mapPxH / 2);

    // Player.
    this.playerTile = { ...map.spawn };
    this.playerDir = "south";
    const playerKey = this.spriteKeyForDir("player", this.playerDir);
    if (this.textures.exists(playerKey)) {
      this.player = this.add.sprite(
        this.playerTile.x * RENDERED_TILE + RENDERED_TILE / 2,
        this.playerTile.y * RENDERED_TILE + RENDERED_TILE / 2,
        playerKey,
      );
      this.player.setScale(ZOOM);
      this.player.setDepth(10);
    }

    // NPCs.
    for (const npc of s.npcs) {
      if (npc.tile_x === null || npc.tile_y === null) continue;
      const key = `npc-${npc.id}-south`;
      if (!this.textures.exists(key)) continue;
      const sprite = this.add.sprite(
        npc.tile_x * RENDERED_TILE + RENDERED_TILE / 2,
        npc.tile_y * RENDERED_TILE + RENDERED_TILE / 2,
        key,
      );
      sprite.setScale(ZOOM);
      sprite.setDepth(5);
      this.npcSprites.set(npc.id, sprite);
    }

    // Input — keyboard arrow keys + WASD.
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys("W,A,S,D") as typeof this.wasd;
    }

    // Initial adjacency check (player may spawn next to an NPC).
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

    if (dir) this.attemptMove(dir);
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
    const key = this.spriteKeyForDir("player", dir);
    if (this.textures.exists(key)) this.player.setTexture(key);
  }

  private attemptMove(dir: Direction) {
    const map = this.state.room.tilemap_data!;
    // Always update facing — even if we can't move, you can turn in place.
    if (this.playerDir !== dir) {
      this.setPlayerFacing(dir);
      this.moveCooldownMs = TURN_COOLDOWN_MS;
      return;
    }

    const dx = dir === "east" ? 1 : dir === "west" ? -1 : 0;
    const dy = dir === "south" ? 1 : dir === "north" ? -1 : 0;
    const nx = this.playerTile.x + dx;
    const ny = this.playerTile.y + dy;

    // Exit detection: stepping ON the exit tile triggers transition.
    for (const [exitDirRaw, exit] of Object.entries(map.exits)) {
      if (!exit) continue;
      if (nx === exit.x && ny === exit.y) {
        this.events.emit("exit-requested", { direction: exitDirRaw as Direction });
        this.moveCooldownMs = 600;
        return;
      }
    }

    if (isWallCell(map, nx, ny)) {
      // Blocked. Brief cooldown so the player isn't spammed.
      this.moveCooldownMs = TURN_COOLDOWN_MS;
      return;
    }

    this.playerTile = { x: nx, y: ny };
    if (this.player) {
      this.player.x = nx * RENDERED_TILE + RENDERED_TILE / 2;
      this.player.y = ny * RENDERED_TILE + RENDERED_TILE / 2;
    }
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
      this.events.emit("npc-adjacent", { npcId: adj });
    }
  }
}
