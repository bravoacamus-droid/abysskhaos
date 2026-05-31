/**
 * Paint a set of monochrome WHITE pixel-art icons for the UI (HP, MP,
 * ATK, DEF, STR, AGI, INT, SPI, KHRYN + 3 categories). User asked
 * explicitly: "los iconos de los stats, atributos y todo deben ser de
 * color blanco todos, pero si debemos poder diferenciarlos asi que
 * deben tener imagenes legibles y bien representativas".
 *
 * Procedural beats PixelLab here because:
 *   - perfect white color (#FFFFFF) every time, no "tinted" surprises
 *   - silhouette-first design, no shading noise
 *   - rapid iteration: change a glyph, regenerate, upload
 *
 * Each icon is 16x16 painted with chunky 1-pixel strokes, then upscaled
 * to 32x32 nearest-neighbour at upload time so it stays crisp on retina.
 * Output: 9 individual PNGs + 3 category PNGs, uploaded to R2 with
 * registerAsset(entityType:'ui', entityId:'icon_<name>_white').
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { PNG } from "pngjs";

import { registerAsset } from "../lib/assets/register";

loadEnv({ path: ".env.local" });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TILE = 16;
const UPSCALE = 2; // final = 32x32
const W: [number, number, number] = [255, 255, 255]; // pure white

/** Each row is the painted line — chars: ' ' transparent, '#' white. */
type Glyph = readonly string[];

/** Tightly-drawn silhouettes. Each 16-line glyph fills the 16x16 canvas. */
const GLYPHS: Record<string, Glyph> = {
  // HP — classic plump heart
  hp: [
    "                ",
    "  ##      ##    ",
    " #### ## ####   ",
    "########### #   ",
    "########### #   ",
    " ###########    ",
    " ###########    ",
    "  #########     ",
    "  #########     ",
    "   #######      ",
    "    #####       ",
    "     ###        ",
    "      #         ",
    "                ",
    "                ",
    "                ",
  ],
  // MP — teardrop
  mp: [
    "                ",
    "       #        ",
    "      ###       ",
    "      ###       ",
    "     #####      ",
    "    #######     ",
    "   #########    ",
    "   #########    ",
    "  ###########   ",
    "  ###########   ",
    "  ###########   ",
    "   #########    ",
    "    #######     ",
    "     #####      ",
    "                ",
    "                ",
  ],
  // ATK — diagonal sword (blade up-right, crossguard, pommel)
  atk: [
    "             ## ",
    "            ##  ",
    "           ##   ",
    "          ##    ",
    "         ##     ",
    "        ##      ",
    "       ##       ",
    "      ##        ",
    "  #  ###        ",
    " ## ## #        ",
    "  #####         ",
    "   #####        ",
    "  ##  ##        ",
    " ##    #        ",
    "                ",
    "                ",
  ],
  // DEF — round shield with center boss
  def: [
    "                ",
    "    ######      ",
    "   ########     ",
    "  ##########    ",
    " ############   ",
    " ####  ##  ###  ",
    " ###  ####  ##  ",
    " ##  ######  #  ",
    " ##  ######  #  ",
    " ###  ####  ##  ",
    " ####  ##  ###  ",
    " ############   ",
    "  ##########    ",
    "   ########     ",
    "    ######      ",
    "                ",
  ],
  // STR — clenched fist
  str: [
    "                ",
    "    ####  #     ",
    "   ## ##  ##    ",
    "   ## ##  ##    ",
    "  ### ##  ##    ",
    "  ### ##  ##    ",
    "  ###########   ",
    "  ############  ",
    " ############   ",
    " ############   ",
    "  ##########    ",
    "  ##########    ",
    "  ##########    ",
    "   ########     ",
    "    ######      ",
    "                ",
  ],
  // AGI — feather (single elegant feather)
  agi: [
    "             #  ",
    "            ##  ",
    "           ##   ",
    "          ###   ",
    "         ####   ",
    "        #####   ",
    "       ###### # ",
    "      #####  ## ",
    "     #####  ##  ",
    "    #####  ##   ",
    "   #####  ##    ",
    "  #####  ##     ",
    " ####  ##       ",
    " ## ##          ",
    " ##             ",
    "                ",
  ],
  // INT — open book (two pages)
  int: [
    "                ",
    "   ## ## ##     ",
    "  ###########   ",
    " #############  ",
    " #####  ###### ",
    " ##### # ##### ",
    " ##### # ##### ",
    " ##### # ##### ",
    " ##### # ##### ",
    " ##### # ##### ",
    " ##### # ##### ",
    " #####  ###### ",
    " #############  ",
    "  ###########   ",
    "                ",
    "                ",
  ],
  // SPI — 4-pointed star with bigger horizontal points (sunburst)
  spi: [
    "                ",
    "       ##       ",
    "       ##       ",
    "       ##       ",
    "      ####      ",
    "  #   ####   #  ",
    "  ## ###### ##  ",
    "  ## ###### ##  ",
    "  ## ###### ##  ",
    "  ## ###### ##  ",
    "  #   ####   #  ",
    "      ####      ",
    "       ##       ",
    "       ##       ",
    "       ##       ",
    "                ",
  ],
  // KHRYN — round coin with simple rune (X in center)
  khryn: [
    "                ",
    "    ######      ",
    "   ########     ",
    "  ##########    ",
    " ####    ####   ",
    " ##  #  #  ##   ",
    " ##  ## #  ##   ",
    " ##  ####  ##   ",
    " ##  ####  ##   ",
    " ##  # ##  ##   ",
    " ##  #  #  ##   ",
    " ####    ####   ",
    "  ##########    ",
    "   ########     ",
    "    ######      ",
    "                ",
  ],
  // WEAPON cat — crossed swords (X)
  cat_weapon: [
    "                ",
    "  ##        ##  ",
    "   ##      ##   ",
    "    ##    ##    ",
    "     ##  ##     ",
    "      ####      ",
    "      ####      ",
    "       ##       ",
    "      ####      ",
    "      ####      ",
    "     ##  ##     ",
    "    ##    ##    ",
    "   ##      ##   ",
    "  ##        ##  ",
    "                ",
    "                ",
  ],
  // ARMOR cat — chestplate
  cat_armor: [
    "                ",
    "  ##  ####  ##  ",
    " #################",
    " ############### ",
    " ##  ########  ##",
    " ##  ########  ##",
    " ##############  ",
    "  ############   ",
    "  ############   ",
    "  ############   ",
    "  ############   ",
    "  ###########    ",
    "   ##########    ",
    "   #########     ",
    "                ",
    "                ",
  ],
  // ACCESSORY cat — ring with gem
  cat_accessory: [
    "                ",
    "      ####      ",
    "     ######     ",
    "      ####      ",
    "                ",
    "    ########    ",
    "   ##########   ",
    "  ####    ####  ",
    "  ###      ###  ",
    "  ###      ###  ",
    "  ####    ####  ",
    "   ##########   ",
    "    ########    ",
    "                ",
    "                ",
    "                ",
  ],
  // CONSUMABLE cat — potion flask
  cat_consumable: [
    "                ",
    "      ####      ",
    "      ####      ",
    "     ######     ",
    "     ######     ",
    "    ########    ",
    "   ##########   ",
    "   ##########   ",
    "  ############  ",
    "  ############  ",
    "  ############  ",
    "  ############  ",
    "  ############  ",
    "   ##########   ",
    "    ########    ",
    "                ",
  ],
};

function paintGlyph(glyph: Glyph): Buffer {
  const png = new PNG({ width: TILE * UPSCALE, height: TILE * UPSCALE });
  for (let gy = 0; gy < TILE; gy++) {
    const row = glyph[gy] ?? "";
    for (let gx = 0; gx < TILE; gx++) {
      const ch = row[gx] ?? " ";
      const opaque = ch === "#";
      for (let dy = 0; dy < UPSCALE; dy++) {
        for (let dx = 0; dx < UPSCALE; dx++) {
          const x = gx * UPSCALE + dx;
          const y = gy * UPSCALE + dy;
          const idx = (y * png.width + x) * 4;
          if (opaque) {
            png.data[idx + 0] = W[0];
            png.data[idx + 1] = W[1];
            png.data[idx + 2] = W[2];
            png.data[idx + 3] = 255;
          } else {
            png.data[idx + 0] = 0;
            png.data[idx + 1] = 0;
            png.data[idx + 2] = 0;
            png.data[idx + 3] = 0;
          }
        }
      }
    }
  }
  return PNG.sync.write(png);
}

(async () => {
  const out: Record<string, string> = {};
  for (const [key, glyph] of Object.entries(GLYPHS)) {
    const buf = paintGlyph(glyph);
    const reg = await registerAsset(sb, {
      data: buf,
      contentType: "image/png",
      entityType: "ui",
      entityId: `icon_${key}_white`,
      field: "sprite",
      prompt: `Monochrome white pixel-art icon for ${key}`,
      endpoint: "local_paint",
      generationSize: "32x32",
      generatedVia: "manual",
      metadata: { glyph: "16x16 procedural upscaled 2x" },
    });
    out[key] = reg.url;
    console.log(`${key.padEnd(15)} ${reg.alreadyExisted ? "(cache hit) " : "(uploaded)  "} ${reg.url}`);
  }
  console.log("\n=== lib/client/icons.ts constants (paste in) ===");
  for (const [k, u] of Object.entries(out)) {
    const constName = k.toUpperCase() + "_ICON_URL";
    console.log(`export const ${constName} =\n  "${u}";`);
  }
})().catch((err) => { console.error(err); process.exit(1); });
