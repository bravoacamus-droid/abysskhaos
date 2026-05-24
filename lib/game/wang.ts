/**
 * Helpers to convert a tile-grid + Wang tileset metadata into a Phaser-ready
 * grid of tile indices.
 *
 * Convention: the room's `tiles[][]` describes each cell as wall (`#`) or
 * floor (`.`). Wang tilesets are corner-based, so for each tile cell we
 * compute its 4 corner terrains by sampling the cell + its diagonal
 * neighbors. The resulting (NW, NE, SW, SE) tuple maps to a unique tile in
 * the metadata.
 *
 * The "vertex" model:
 *   - For an N×M tile grid, we conceptually have an (N+1)×(M+1) vertex grid.
 *   - Vertex (vx, vy) is upper if any of the 4 cells touching it is wall.
 *   - Tile at (x, y) reads its corners from vertices (x, y), (x+1, y),
 *     (x, y+1), (x+1, y+1).
 *
 * In simple closed rooms (wall border + floor middle) this gives nicely
 * blended Wang transitions where the wall has visible thickness.
 */

import type { TilemapData, WangTileMeta, WangTilesetMeta } from "@/lib/client/api";

export type Terrain = "upper" | "lower";

/** PixelLab MCP returns tile array under `tileset_data.tiles`. Be lenient
 *  to either shape so we don't break if the API changes. */
function tilesOf(meta: WangTilesetMeta): WangTileMeta[] {
  return meta.tileset_data?.tiles ?? meta.tiles ?? [];
}

/** Build the (W+1)×(H+1) vertex grid from a room's tilemap. */
export function buildVertexGrid(map: TilemapData): Terrain[][] {
  const W = map.width;
  const H = map.height;
  const grid: Terrain[][] = Array.from({ length: H + 1 }, () =>
    Array.from({ length: W + 1 }, () => "lower" as Terrain),
  );
  for (let y = 0; y < H; y++) {
    const row = map.tiles[y] ?? "";
    for (let x = 0; x < W; x++) {
      const ch = row[x] ?? ".";
      if (ch === "#") {
        grid[y]![x] = "upper";
        grid[y]![x + 1] = "upper";
        grid[y + 1]![x] = "upper";
        grid[y + 1]![x + 1] = "upper";
      }
    }
  }
  return grid;
}

/** Look up the tile metadata that matches a corner combo. */
function findTileByCorners(
  meta: WangTilesetMeta,
  NW: Terrain,
  NE: Terrain,
  SW: Terrain,
  SE: Terrain,
): WangTileMeta | null {
  for (const tile of tilesOf(meta)) {
    if (
      tile.corners.NW === NW &&
      tile.corners.NE === NE &&
      tile.corners.SW === SW &&
      tile.corners.SE === SE
    ) {
      return tile;
    }
  }
  return null;
}

/** Convert a tile's bounding box (px) into a Phaser tile index. The PNG is a
 *  4×4 grid of 16-px tiles (or 32-px for 32-tile sets); we compute index
 *  row-major. */
export function tileIndexFromBox(
  bbox: { x: number; y: number; width: number; height: number },
  imageWidthPx: number,
): number {
  const cols = Math.max(1, Math.floor(imageWidthPx / bbox.width));
  const col = Math.floor(bbox.x / bbox.width);
  const row = Math.floor(bbox.y / bbox.height);
  return row * cols + col;
}

/**
 * Build a 2D number array of Phaser tile indices for the room.
 *
 * Phase 3c switched from Wang corner-based blending to direct cell-based
 * rendering. The corner model was elegant for transitions but produced a
 * critical mismatch with the collision layer: a single floor cell (`.`)
 * surrounded by walls has all 4 corner vertices "upper", so the Wang
 * lookup picked the all-wall tile — visually identical to surrounding
 * walls, even though the cell is walkable. That's how exits ended up
 * looking like solid stone.
 *
 * Cell-based: every `.` paints the all-lower tile, every `#` paints the
 * all-upper tile. The visual is now 1:1 with `isWallCell`, so the player
 * never sees passable floor that looks like wall (or walkable wall).
 * Trade-off: transitions are blocky instead of soft, but PixelLab's
 * tileset's all-lower tile already includes its own subtle bevel.
 */
export function buildTileIndexGrid(
  map: TilemapData,
  meta: WangTilesetMeta,
  paddingTiles = 0,
): number[][] {
  const W = map.width + paddingTiles * 2;
  const H = map.height + paddingTiles * 2;
  const imageWidthPx = meta.tileset_image.dimensions.width;

  const allTiles = tilesOf(meta);
  if (allTiles.length === 0) {
    return Array.from({ length: H }, () => Array.from({ length: W }, () => 0));
  }
  const lowerTile =
    findTileByCorners(meta, "lower", "lower", "lower", "lower") ?? allTiles[0]!;
  const upperTile =
    findTileByCorners(meta, "upper", "upper", "upper", "upper") ?? lowerTile;
  const lowerIdx = tileIndexFromBox(lowerTile.bounding_box, imageWidthPx);
  const upperIdx = tileIndexFromBox(upperTile.bounding_box, imageWidthPx);

  // Padding cells (outside the playable map) always render as wall so the
  // map's borders continue seamlessly into the surrounding void — no
  // visible gap between the interior and the cave-wall background halo,
  // because both use the SAME tileset texture.
  const out: number[][] = [];
  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) {
      const realX = x - paddingTiles;
      const realY = y - paddingTiles;
      if (realX < 0 || realY < 0 || realX >= map.width || realY >= map.height) {
        row.push(upperIdx);
        continue;
      }
      const ch = map.tiles[realY]?.[realX] ?? "#";
      row.push(ch === "#" ? upperIdx : lowerIdx);
    }
    out.push(row);
  }
  return out;
}

/** True if the cell is a wall (collision). Used by the player movement loop. */
export function isWallCell(map: TilemapData, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return true;
  const row = map.tiles[y] ?? "";
  return (row[x] ?? "#") === "#";
}
