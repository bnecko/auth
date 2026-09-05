"use client";

import { Button } from "@/components/Button";

// Segment-level boundary: the root layout survived, so this renders inside it.
// instrumentation.ts has already logged the error server-side with the same
// digest shown here, which is how a support report maps to a log line.
export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[400px] bg-card border border-rule rounded-lg shadow-card p-7">
        <h1 className="text-[20px] tracking-tight text-fg mb-1.5">
          Something went wrong
        </h1>
        <p className="text-[13px] text-secondary mb-5">
          The page could not be loaded. Trying again often works.
        </p>
        {error.digest && (
          <p className="text-[12px] text-muted mb-5">
            Reference <code className="font-mono text-fg">{error.digest}</code>
          </p>
        )}
        <Button type="button" variant="secondary" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
