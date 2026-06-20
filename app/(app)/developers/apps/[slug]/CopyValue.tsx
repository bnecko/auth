"use client";

import { useState } from "react";
import { Button } from "@/components/Button";

export function CopyValue({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. non-secure context). Drop quietly -
      // the value is still visible for manual copy.
    }
  }

  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-accent-strong">{value}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={copy}
        aria-label={`copy ${label || "value"}`}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </span>
  );
}
