import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ABYSS palette — high contrast for OLED, neon-on-void.
        // Surface tokens go from black (void) to lighter panels (ink); coal is
        // the borders/dividers shade. Text tokens (fog, mist) are deliberately
        // light enough to clear WCAG AA on the darkest surface.
        abyss: {
          void: "#06070C", // app background
          deep: "#0E1018", // panel surface
          ink: "#161826", // elevated panel
          coal: "#2A2D3F", // borders, dividers, subtle hover background
          fog: "#9BA4B8", // muted body text (~8.5:1 on `deep`)
          mist: "#C8CDDB", // emphasised muted text (~12:1 on `deep`)
          khaos: "#7B1FA2",
          ember: "#FF5722",
          soul: "#00E5D1",
          gold: "#FFB300",
        },
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
