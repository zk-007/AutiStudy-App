import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./expression-lab/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Icy / glacier palette - calming, autism-friendly
        glacier: {
          50: "#F7FBFC",
          100: "#E8F4F8",
          200: "#DCEEF5",
          300: "#BEE3F8",
          400: "#9AD0EC",
          500: "#7FB3D5",
          600: "#5B91B8",
          700: "#3F6F92",
        },
        mint: {
          100: "#EAF5F2",
          200: "#DCEEE9",
          300: "#C8E6E0",
          400: "#A8D5CC",
        },
        deep: {
          DEFAULT: "#0F2D4A",
          soft: "#234567",
          muted: "#5A7A95",
        },
        background: "#F7FBFC",
        foreground: "#0F2D4A",
      },
      fontFamily: {
        display: ["var(--font-quicksand)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(190, 227, 248, 0.6)",
        soft: "0 10px 40px rgba(15, 45, 74, 0.08)",
        deep: "0 20px 60px rgba(15, 45, 74, 0.12)",
      },
      animation: {
        "drift-bg": "drift 20s ease-in-out infinite",
        "float-slow": "float 6s ease-in-out infinite",
        "breathe": "breathe 3s ease-in-out infinite",
        "bounce-soft": "bounceSoft 2s ease-in-out infinite",
        "shimmer": "shimmer 3s linear infinite",
      },
      keyframes: {
        drift: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.03)", opacity: "0.92" },
        },
        bounceSoft: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
