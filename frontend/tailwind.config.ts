import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
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
        // Palette driven by CSS variables so Light/Dark can remap globally
        glacier: {
          50: "rgb(var(--glacier-50) / <alpha-value>)",
          100: "rgb(var(--glacier-100) / <alpha-value>)",
          200: "rgb(var(--glacier-200) / <alpha-value>)",
          300: "rgb(var(--glacier-300) / <alpha-value>)",
          400: "rgb(var(--glacier-400) / <alpha-value>)",
          500: "rgb(var(--glacier-500) / <alpha-value>)",
          600: "rgb(var(--glacier-600) / <alpha-value>)",
          700: "rgb(var(--glacier-700) / <alpha-value>)",
        },
        mint: {
          100: "rgb(var(--mint-100) / <alpha-value>)",
          200: "rgb(var(--mint-200) / <alpha-value>)",
          300: "rgb(var(--mint-300) / <alpha-value>)",
          400: "rgb(var(--mint-400) / <alpha-value>)",
        },
        deep: {
          DEFAULT: "rgb(var(--deep) / <alpha-value>)",
          soft: "rgb(var(--deep-soft) / <alpha-value>)",
          muted: "rgb(var(--deep-muted) / <alpha-value>)",
        },
        background: "rgb(var(--app-bg) / <alpha-value>)",
        foreground: "rgb(var(--deep) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-quicksand)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(190, 227, 248, 0.6)",
        soft: "var(--shadow-soft)",
        deep: "var(--shadow-deep)",
        cute: "var(--shadow-soft)",
      },
      borderRadius: {
        "4xl": "2rem",
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
