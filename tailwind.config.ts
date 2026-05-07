import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ABYSS palette — high contrast for OLED, neon-on-void
        abyss: {
          void: "#06070C",
          deep: "#0E1018",
          ink: "#161826",
          fog: "#252736",
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
