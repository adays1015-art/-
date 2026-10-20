import type { Config } from "tailwindcss";

// 기업 컬러(블루) 기반 토큰. brand-700 = #1A4FA0 (기획서 양식과 동일).
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
          DEFAULT: "#F5F7FB",
          panel: "#FFFFFF",
          subtle: "#EEF2F8",
        },
        border: {
          DEFAULT: "#DCE3EE",
          strong: "#C9D9EE",
        },
        ink: {
          900: "#1B2333",
          800: "#2A3447",
          700: "#3F4A5E",
          600: "#5B6B82",
          500: "#7A889C",
          400: "#A3AFC0",
        },
        brand: {
          50: "#F2F7FD",
          100: "#E7F1FB",
          200: "#C9DCF4",
          300: "#9DBFEA",
          400: "#5F95DA",
          500: "#2F6FD0",
          600: "#235DB8",
          700: "#1A4FA0",
          800: "#143D7D",
          900: "#0F2E5E",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Pretendard", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(27,35,51,0.05), 0 1px 1px rgba(27,35,51,0.03)",
      },
      borderRadius: {
        xl2: "14px",
      },
    },
  },
  plugins: [],
};

export default config;
