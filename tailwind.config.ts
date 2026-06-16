import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#F7F6F2",
          panel: "#FFFFFF",
          subtle: "#F1EFE8",
        },
        border: {
          DEFAULT: "#E5E2D8",
          strong: "#D4D0C2",
        },
        ink: {
          900: "#1F1D1A",
          800: "#2F2C27",
          700: "#4A463E",
          600: "#6B665B",
          500: "#8E8879",
          400: "#B0AB9D",
        },
        beige: {
          50: "#FAF7F0",
          100: "#F2EDDF",
          200: "#E6DDC4",
          300: "#D6C8A2",
          400: "#BFAC7C",
          500: "#A18E5E",
          600: "#80714A",
        },
        status: {
          plan: "#94A3B8",
          progress: "#3B82F6",
          done: "#10B981",
          hold: "#F59E0B",
          danger: "#EF4444",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Pretendard", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(31,29,26,0.04), 0 1px 1px rgba(31,29,26,0.03)",
        pop: "0 8px 24px rgba(31,29,26,0.10)",
      },
      borderRadius: {
        xl2: "14px",
      },
    },
  },
  plugins: [],
};

export default config;
