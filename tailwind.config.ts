import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // All palette tokens are driven by CSS variables in
        // app/globals.css so the same names work for themes if/when
        // we add a light mode. Anything not listed here is forbidden
        // — pick one of these or argue for a new token.
        bg: "var(--bg)",
        "bg-soft": "var(--bg-soft)",
        rule: "var(--rule)",
        "rule-strong": "var(--rule-strong)",
        fg: "var(--fg)",
        secondary: "var(--secondary)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        accent: "var(--accent)",
        "accent-dim": "var(--accent-dim)",
        danger: "var(--danger)",
        ok: "var(--ok)",

        // Backward-compatible aliases for surfaces that still
        // reference the old token names. Most pages use these via
        // class strings — removing them would mean a rewrite of
        // every file. Phase out when convenient.
        surface: "var(--bg-soft)",
        elevated: "var(--bg-soft)",
        hover: "var(--bg-soft)",
        border: "var(--rule)",
        "border-strong": "var(--rule-strong)",
        success: "var(--ok)",
        warning: "var(--accent)",
        info: "var(--secondary)",
      },
      fontFamily: {
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
        meta: ["12px", { lineHeight: "16px", letterSpacing: "0.01em" }],
        micro: ["11px", { lineHeight: "14px", letterSpacing: "0.06em" }],
      },
      letterSpacing: {
        tightest: "-0.02em",
        wider: "0.08em",
      },
      borderRadius: {
        // Strict: nothing has rounded corners. The token still
        // exists at sm=0 so legacy `rounded-sm` calls compile to
        // square; remove the calls when convenient.
        none: "0",
        sm: "0",
      },
    },
  },
  plugins: [],
};

export default config;
