"use client";

import { useState } from "react";

export function CodeTabs({ tabs }: { tabs: { label: string; code: string }[] }) {
  const [active, setActive] = useState(0);

  if (!tabs || tabs.length === 0) return null;

  return (
    <div className="rounded-sm border border-border bg-bg overflow-hidden">
      <div className="flex bg-surface border-b border-border overflow-x-auto">
        {tabs.map((tab, idx) => (
          <button
            key={tab.label}
            onClick={() => setActive(idx)}
            className={`px-4 py-2 text-micro uppercase tracking-[0.05em] font-medium transition-colors whitespace-nowrap focus:outline-none focus-visible:bg-hover ${
              active === idx
                ? "text-fg border-b-2 border-fg -mb-px"
                : "text-faint hover:text-secondary hover:bg-hover/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-[12px] leading-5 text-fg">
        <code>{tabs[active].code}</code>
      </pre>
    </div>
  );
}
