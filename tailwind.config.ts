import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#070707",
        surface: "#0d0d0e",
        elevated: "#141416",
        hover: "#1a1a1c",
        border: "#1f1f22",
        "border-strong": "#2a2a2e",
        fg: "#f4f4f5",
        secondary: "#a1a1aa",
        muted: "#6b6b72",
        faint: "#3f3f46",
        accent: "#d4d4d8",
        danger: "#c25450",
        success: "#5a9a6a",
        warning: "#c39348",
        info: "#6b8eb8",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Inter",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        meta: ["11.5px", { lineHeight: "16px", letterSpacing: "0.01em" }],
        micro: ["10.5px", { lineHeight: "14px", letterSpacing: "0.06em" }],
      },
      letterSpacing: {
        tightest: "-0.02em",
      },
    },
  },
  plugins: [],
};

export default config;
