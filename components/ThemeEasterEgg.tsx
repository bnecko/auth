"use client";

import { useEffect } from "react";

// Phosphor color easter egg. Type "blood" anywhere outside an input
// field and the amber accent swaps for vivid red — every text-accent,
// border-accent, bg-accent, and the ::selection style updates in lock
// step because the whole palette routes through CSS variables. Type
// "blood" again to revert. Preference persists in localStorage. The
// pre-hydration script in app/layout.tsx applies the saved choice
// before paint to avoid a color flash on reload.

const BLOOD_ACCENT = "#ff003c";
const BLOOD_ACCENT_DIM = "#5c0017";
const SEQUENCE = "blood";

export function ThemeEasterEgg() {
  useEffect(() => {
    let buffer = "";
    let timer: ReturnType<typeof setTimeout> | undefined;

    function applyBlood() {
      const s = document.documentElement.style;
      s.setProperty("--accent", BLOOD_ACCENT);
      s.setProperty("--accent-dim", BLOOD_ACCENT_DIM);
    }

    function resetTheme() {
      const s = document.documentElement.style;
      s.removeProperty("--accent");
      s.removeProperty("--accent-dim");
    }

    function toggle() {
      const isBlood = localStorage.getItem("bn-theme") === "blood";
      if (isBlood) {
        localStorage.removeItem("bn-theme");
        resetTheme();
      } else {
        localStorage.setItem("bn-theme", "blood");
        applyBlood();
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;

      buffer += e.key.toLowerCase();
      if (buffer.length > 16) buffer = buffer.slice(-16);

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        buffer = "";
      }, 1500);

      if (buffer.endsWith(SEQUENCE)) {
        toggle();
        buffer = "";
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
