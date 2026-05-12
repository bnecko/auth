"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
          theme: "dark";
        },
      ) => string;
      reset: (widgetId: string) => void;
    };
  }
}

let turnstileScript: Promise<void> | null = null;

function loadTurnstile() {
  if (window.turnstile) {
    return Promise.resolve();
  }

  if (turnstileScript) {
    return turnstileScript;
  }

  turnstileScript = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("failed to load verification"));
    document.head.appendChild(script);
  });

  return turnstileScript;
}

export function TurnstileField() {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [siteKey, setSiteKey] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/config")
      .then(response => response.json())
      .then((data: { turnstileSiteKey?: string }) => {
        setSiteKey(data.turnstileSiteKey || "");
      })
      .catch(() => setError("verification unavailable"));
  }, []);

  useEffect(() => {
    if (!siteKey || !containerRef.current || widgetIdRef.current) {
      return;
    }

    loadTurnstile()
      .then(() => {
        if (!window.turnstile || !containerRef.current) {
          setError("verification unavailable");
          return;
        }

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "dark",
          callback: value => {
            setToken(value);
            setError("");
          },
          "expired-callback": () => {
            setToken("");
          },
          "error-callback": () => {
            setToken("");
            setError("verification failed");
          },
        });
      })
      .catch(() => setError("verification unavailable"));
  }, [siteKey]);

  if (!siteKey) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <input type="hidden" name="turnstileToken" value={token} />
      <div ref={containerRef} />
      {error && <p className="text-meta text-danger">× {error}</p>}
    </div>
  );
}
