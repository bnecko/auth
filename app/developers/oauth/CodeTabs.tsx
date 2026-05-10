"use client";

import { useState } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-json";
import "prismjs/themes/prism-tomorrow.css"; // IDE-like dark theme

export function CodeTabs({ tabs }: { tabs: { label: string; code: string }[] }) {
  const [active, setActive] = useState(0);

  if (!tabs || tabs.length === 0) return null;

  const activeTab = tabs[active];

  let lang = "none";
  if (activeTab.label.toLowerCase().includes("curl") || activeTab.label.toLowerCase().includes("browser")) {
    lang = "bash";
  } else if (activeTab.label.toLowerCase().includes("node") || activeTab.label.toLowerCase().includes("javascript")) {
    lang = "javascript";
  } else if (activeTab.label.toLowerCase().includes("python")) {
    lang = "python";
  } else if (activeTab.label.toLowerCase().includes("json")) {
    lang = "json";
  }

  const highlightedCode = lang !== "none" && Prism.languages[lang]
    ? Prism.highlight(activeTab.code, Prism.languages[lang], lang)
    : activeTab.code;

  return (
    <div className="rounded-sm border border-border bg-bg overflow-hidden">
      <div className="flex bg-surface border-b border-border overflow-x-auto">
        {tabs.map((tab, idx) => (
          <button
            key={tab.label}
            onClick={() => setActive(idx)}
            className={`px-4 py-2.5 text-micro uppercase tracking-[0.05em] font-medium transition-colors whitespace-nowrap focus:outline-none focus-visible:bg-hover ${
              active === idx
                ? "text-fg border-b-2 border-fg -mb-px"
                : "text-faint hover:text-secondary hover:bg-hover/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <pre 
        className="overflow-x-auto px-4 py-4 text-[13px] leading-6 bg-[#2d2d2d]" 
        style={{ margin: 0, borderRadius: 0, textShadow: "none" }}
      >
        <code 
          className={`language-${lang}`} 
          dangerouslySetInnerHTML={{ __html: highlightedCode }} 
        />
      </pre>
    </div>
  );
}
