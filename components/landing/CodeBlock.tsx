"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the code is still selectable in the block.
    }
  }

  return (
    <div className="rounded-xl border border-rule bg-card overflow-hidden shadow-card">
      <div className="flex items-center justify-between h-10 px-4 border-b border-rule">
        <span className="text-[12px] text-muted font-mono">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-fg transition-colors"
          aria-label="Copy code"
        >
          {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-[12.5px] leading-relaxed font-mono text-secondary">
        <code>{code}</code>
      </pre>
    </div>
  );
}
