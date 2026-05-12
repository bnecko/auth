"use client";

import { useState } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-json";
import "prismjs/themes/prism-tomorrow.css";

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
    <div>
      <div className="flex border-b border-rule overflow-x-auto overflow-y-hidden no-scrollbar">
        {tabs.map((tab, idx) => (
          <button
            key={tab.label}
            onClick={() => setActive(idx)}
            className={`px-3 h-8 text-meta uppercase tracking-wider transition-colors whitespace-nowrap focus:outline-none ${
              active === idx
                ? "text-accent"
                : "text-secondary hover:text-fg"
            }`}
          >
            {active === idx && <span className="text-accent mr-1.5">▸</span>}
            {tab.label}
          </button>
        ))}
      </div>
      <pre className="oauth-code-block overflow-x-auto px-3 py-3 text-[12.5px] leading-6">
        <code
          className={`oauth-code language-${lang}`}
          dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
      </pre>
    </div>
  );
}
