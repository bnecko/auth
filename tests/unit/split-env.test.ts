import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

type SplitResult = { files: Map<string, string>; unknown: string[] };
type SplitEnvModule = {
  scopesFromExamples: (examples: Record<string, string>) => Map<string, string>;
  splitEnv: (source: string, scopeOfKey: Map<string, string>) => SplitResult;
};

// The script is plain ESM run by node, outside the TypeScript project.
let splitter: SplitEnvModule;
beforeAll(async () => {
  const path = '../../scripts/split-env.mjs';
  splitter = (await import(/* @vite-ignore */ path)) as SplitEnvModule;
});

const SCOPES = new Map([
  ['POSTGRES_PASSWORD', 'core'],
  ['OIDC_PRIVATE_KEY_PEM', 'core'],
  ['TELEGRAM_BOT_TOKEN', 'telegram'],
  ['CRYPTO_ENABLED', 'crypto'],
]);

describe('splitEnv', () => {
  it('moves each line to its scope without touching the value', () => {
    const pem = 'OIDC_PRIVATE_KEY_PEM="-----BEGIN KEY-----\\nab=cd==\\n-----END KEY-----"';
    const { files } = splitter.splitEnv(
      ['POSTGRES_PASSWORD=p@ss word=1', 'TELEGRAM_BOT_TOKEN=123:abc', pem, 'CRYPTO_ENABLED=true'].join('\n'),
      SCOPES,
    );

    expect(files.get('core')).toBe(`POSTGRES_PASSWORD=p@ss word=1\n\n${pem}\n`);
    expect(files.get('telegram')).toBe('TELEGRAM_BOT_TOKEN=123:abc\n');
    expect(files.get('crypto')).toBe('CRYPTO_ENABLED=true\n');
  });

  // Dropping a key nobody recognises would silently remove a production
  // setting, so it is kept and named instead.
  it('keeps a key no example declares, and reports it by name', () => {
    const { files, unknown } = splitter.splitEnv('TEST_BEARER=leftover\nCRYPTO_ENABLED=true', SCOPES);

    expect(unknown).toEqual(['TEST_BEARER']);
    expect(files.get('core')).toBe('TEST_BEARER=leftover\n');
  });

  it('carries the comment block above a key along with it', () => {
    const { files } = splitter.splitEnv(
      ['# rotated 2026-09', '# by hand', 'TELEGRAM_BOT_TOKEN=t', '', '# orphaned note', '', 'CRYPTO_ENABLED=true'].join('\n'),
      SCOPES,
    );

    expect(files.get('telegram')).toBe('# rotated 2026-09\n# by hand\nTELEGRAM_BOT_TOKEN=t\n');
    expect(files.get('crypto')).toBe('CRYPTO_ENABLED=true\n');
  });

  // The error names the line number only. Echoing the line could put a secret
  // in a terminal or a CI log.
  it('refuses a line it cannot classify without echoing it', () => {
    const attempt = () => splitter.splitEnv('CRYPTO_ENABLED=true\nhunter2 is the password', SCOPES);

    expect(attempt).toThrow('line 2');
    expect(attempt).not.toThrow(/hunter2/);
  });

  it('refuses a value that opens a quote and does not close it', () => {
    expect(() => splitter.splitEnv('OIDC_PRIVATE_KEY_PEM="-----BEGIN KEY-----', SCOPES)).toThrow(
      'OIDC_PRIVATE_KEY_PEM opens a quote',
    );
  });
});

describe('the scoped example files', () => {
  const examples: Record<string, string> = {};
  for (const name of readdirSync('deploy').filter(file => file.endsWith('.env.example'))) {
    examples[name.replace('.env.example', '')] = readFileSync(join('deploy', name), 'utf8');
  }

  it('declare each key in exactly one scope', () => {
    expect(() => splitter.scopesFromExamples(examples)).not.toThrow();
    expect(() => splitter.scopesFromExamples({ core: 'A=1', ops: 'A=2' })).toThrow('A is declared in both core and ops');
  });

  // Compose is the only thing that reads these files. A variable it
  // interpolates but no example declares is one an operator cannot discover.
  it('cover every variable docker-compose.yml interpolates', () => {
    const compose = readFileSync('docker-compose.yml', 'utf8');
    const interpolated = [...new Set([...compose.matchAll(/\$\{([A-Z0-9_]+)/g)].map(match => match[1]))];
    const declared = splitter.scopesFromExamples(examples);

    expect(interpolated.filter(name => !declared.has(name))).toEqual([]);
  });
});
