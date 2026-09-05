import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Server actions run on their own POST before any layout re-renders, so the
// layout's redirects never gate them. Every exported action must therefore
// establish its own principal. This is a text-level check (no TS parser):
// each exported function body, or a file-local helper it calls, must
// reference one of the guard helpers, unless it is allowlisted below.

const ROOT = process.cwd();

// Exports that are unauthenticated by design, or that read the session but
// deliberately skip the restricted check.
const ALLOW: Record<string, 'public' | 'session-only'> = {
  'app/forgot/actions.ts#requestPasswordReset': 'public',
  'app/forgot/reset/actions.ts#resetPasswordAction': 'public',
  'app/restricted/actions.ts#signOutAction': 'public',
  // The restricted user's own appeal reply: session required, restriction
  // is the point, so assertNotRestricted would lock them out of the appeal.
  'app/restricted/actions.ts#restrictedReplyAction': 'session-only',
};

// Pages with inline "use server" closures. Each closure trusts the session
// state the page resolved at render time, so a new one needs a decision.
const INLINE_ALLOW = ['app/device/page.tsx'];

function appFiles(predicate: (rel: string) => boolean) {
  return readdirSync(path.join(ROOT, 'app'), { recursive: true, encoding: 'utf8' })
    .filter(rel => /\.(ts|tsx)$/.test(rel) && predicate(rel))
    .map(rel => `app/${rel}`)
    .sort();
}

const actionFiles = appFiles(rel => rel.endsWith('actions.ts'));

type Chunk = { name: string; exported: boolean; text: string };

// Top-level function declarations only; anything else exported is rejected
// separately so an arrow-function action cannot slip past this scan.
function functionChunks(source: string): Chunk[] {
  const re = /^(export\s+)?(async\s+)?function\s+(\w+)/gm;
  const starts = [...source.matchAll(re)].map(m => ({
    index: m.index as number,
    exported: Boolean(m[1]),
    name: m[3],
  }));
  return starts.map((s, i) => ({
    name: s.name,
    exported: s.exported,
    text: source.slice(s.index, starts[i + 1]?.index ?? source.length),
  }));
}

function hasOwnGuard(text: string) {
  return (
    /\brequireAdminStepUpSession\(/.test(text) ||
    (/\bgetCurrentSession\(/.test(text) && /\bassertNotRestricted\(/.test(text))
  );
}

describe('server action guards', () => {
  it('finds the action modules', () => {
    expect(actionFiles.length).toBeGreaterThan(0);
  });

  it.each(actionFiles)('%s is a server module exporting only functions', file => {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    expect(source.trimStart().startsWith('"use server"')).toBe(true);
    expect(source).not.toMatch(/^export\s+(const|let|var|default)\b/m);
  });

  it.each(actionFiles)('%s guards every exported action', file => {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    const chunks = functionChunks(source);
    const localGuards = chunks.filter(c => !c.exported && hasOwnGuard(c.text)).map(c => c.name);

    for (const chunk of chunks.filter(c => c.exported)) {
      const key = `${file}#${chunk.name}`;
      const guarded =
        hasOwnGuard(chunk.text) || localGuards.some(name => new RegExp(`\\b${name}\\(`).test(chunk.text));
      const allowed = ALLOW[key];

      if (allowed === 'public') continue;
      if (allowed === 'session-only') {
        expect(chunk.text, `${key} must still resolve the session`).toMatch(/\bgetCurrentSession\(/);
        continue;
      }
      expect(guarded, `${key} has no principal check and is not allowlisted`).toBe(true);
    }
  });

  it('has no stale allowlist entries', () => {
    const exported = new Set(
      actionFiles.flatMap(file =>
        functionChunks(readFileSync(path.join(ROOT, file), 'utf8'))
          .filter(c => c.exported)
          .map(c => `${file}#${c.name}`),
      ),
    );
    for (const key of Object.keys(ALLOW)) {
      expect(exported.has(key), `${key} is allowlisted but no longer exported`).toBe(true);
    }
  });

  it('knows every page with inline server actions', () => {
    const inline = appFiles(rel => !rel.endsWith('actions.ts')).filter(file =>
      /"use server"/.test(readFileSync(path.join(ROOT, file), 'utf8')),
    );
    expect(inline).toEqual(INLINE_ALLOW);
  });
});
