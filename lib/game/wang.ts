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
  for (const tile of meta.tiles) {
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
 * Build a 2D number array of Phaser tile indices for the room. Cells that
 * find no matching Wang tile fall back to the "all-lower" tile (pure floor)
 * if available, otherwise 0.
 */
export function buildTileIndexGrid(
  map: TilemapData,
  meta: WangTilesetMeta,
): number[][] {
  const W = map.width;
  const H = map.height;
  const verts = buildVertexGrid(map);
  const imageWidthPx = meta.tileset_image.dimensions.width;

  const fallbackTile =
    findTileByCorners(meta, "lower", "lower", "lower", "lower") ?? meta.tiles[0]!;
  const fallbackIdx = tileIndexFromBox(fallbackTile.bounding_box, imageWidthPx);

  const out: number[][] = [];
  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) {
      const NW = verts[y]![x]!;
      const NE = verts[y]![x + 1]!;
      const SW = verts[y + 1]![x]!;
      const SE = verts[y + 1]![x + 1]!;
      const tile = findTileByCorners(meta, NW, NE, SW, SE);
      row.push(tile ? tileIndexFromBox(tile.bounding_box, imageWidthPx) : fallbackIdx);
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
