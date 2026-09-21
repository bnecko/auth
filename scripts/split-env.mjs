import { chmod, copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Splits one monolithic compose env file into the scoped files described by
// deploy/*.env.example. Which scope a key belongs to is read from those
// examples, so they stay the single description of the layout.
//
// A value is never printed, logged or parsed: lines are moved verbatim. The
// source file is left in place, so the operator removes it only once the split
// has been checked.

const ASSIGNMENT = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
const FALLBACK_SCOPE = "core";

function isUnterminated(value) {
  const quote = value[0];
  if (quote !== '"' && quote !== "'") return false;
  return value.indexOf(quote, 1) === -1;
}

export function scopesFromExamples(examples) {
  const scopeOfKey = new Map();
  for (const [scope, text] of Object.entries(examples)) {
    for (const line of text.split("\n")) {
      const match = line.match(ASSIGNMENT);
      if (!match) continue;
      const previous = scopeOfKey.get(match[1]);
      if (previous) throw new Error(`${match[1]} is declared in both ${previous} and ${scope}`);
      scopeOfKey.set(match[1], scope);
    }
  }
  return scopeOfKey;
}

// A comment block directly above an assignment travels with it, so an
// operator's own notes survive the move. A blank line ends the block.
export function splitEnv(sourceText, scopeOfKey) {
  const sections = new Map();
  const unknown = [];
  let pendingComments = [];

  sourceText.split("\n").forEach((line, index) => {
    if (/^\s*$/.test(line)) {
      pendingComments = [];
      return;
    }
    if (/^\s*#/.test(line)) {
      pendingComments.push(line);
      return;
    }

    const match = line.match(ASSIGNMENT);
    // The line number only: echoing the line could put a secret on screen.
    if (!match) throw new Error(`line ${index + 1} is not a comment or an assignment`);
    const [, key, value] = match;
    if (isUnterminated(value)) {
      throw new Error(`${key} opens a quote it does not close; multi-line values are not supported`);
    }

    let scope = scopeOfKey.get(key);
    if (!scope) {
      unknown.push(key);
      scope = FALLBACK_SCOPE;
    }
    if (!sections.has(scope)) sections.set(scope, []);
    sections.get(scope).push([...pendingComments, line].join("\n"));
    pendingComments = [];
  });

  const files = new Map();
  for (const [scope, blocks] of sections) files.set(scope, `${blocks.join("\n\n")}\n`);
  return { files, unknown };
}

async function readExamples(dir) {
  const examples = {};
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".env.example")) continue;
    examples[basename(name, ".env.example")] = await readFile(join(dir, name), "utf8");
  }
  if (Object.keys(examples).length === 0) throw new Error(`no *.env.example files in ${dir}`);
  return examples;
}

async function exists(path) {
  return stat(path).then(() => true, () => false);
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const source = args.find(arg => !arg.startsWith("--"));
  if (!source) {
    throw new Error("usage: node scripts/split-env.mjs <env file> [--write]   (without --write it only reports)");
  }

  const sourcePath = resolve(source);
  const outDir = resolve(sourcePath, "..");
  const scopeOfKey = scopesFromExamples(await readExamples(resolve("deploy")));
  const { files, unknown } = splitEnv(await readFile(sourcePath, "utf8"), scopeOfKey);

  for (const [scope, text] of files) {
    const keys = text.split("\n").filter(line => ASSIGNMENT.test(line)).length;
    console.log(`${scope}.env: ${keys} keys`);
  }
  if (unknown.length > 0) {
    console.log(`not in any example, kept in ${FALLBACK_SCOPE}.env: ${unknown.join(", ")}`);
  }
  // Compose refuses to start when a file named in COMPOSE_ENV_FILES is
  // missing, so every scope gets a file even if the source held none of its keys.
  const scopes = new Set([...scopeOfKey.values(), ...files.keys()]);

  if (!write) {
    console.log("dry run: nothing written. Re-run with --write.");
    return;
  }

  for (const scope of scopes) {
    if (await exists(join(outDir, `${scope}.env`))) {
      throw new Error(`${scope}.env already exists in ${outDir}; move it aside first`);
    }
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const backup = `${sourcePath}.bak-${stamp}`;
  await copyFile(sourcePath, backup);
  await chmod(backup, 0o600);

  await mkdir(outDir, { recursive: true });
  for (const scope of scopes) {
    const target = join(outDir, `${scope}.env`);
    await writeFile(target, files.get(scope) ?? "", { mode: 0o600 });
    await chmod(target, 0o600);
  }

  const list = [...scopes].sort().map(scope => join(outDir, `${scope}.env`)).join(",");
  console.log(`wrote ${scopes.size} files (0600), backup at ${backup}`);
  console.log(`COMPOSE_ENV_FILES=${list}`);
  console.log(`${basename(sourcePath)} was left in place; remove it once the split is verified.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
