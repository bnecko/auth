"use client";

import { useState } from "react";

export function CopyValue({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. non-secure context). Drop quietly —
      // the value is still visible for manual copy.
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono">{value}</span>
      <button
        type="button"
        onClick={copy}
        className="text-meta text-secondary hover:text-fg transition-colors"
        aria-label={`copy ${label || "value"}`}
      >
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
}
