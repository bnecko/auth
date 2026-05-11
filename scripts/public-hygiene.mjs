import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const result = spawnSync("git", ["ls-files"], { encoding: "utf8" });
if (result.status !== 0) {
  throw new Error(result.stderr || "git ls-files failed");
}

const blocked = [
  new RegExp("Generated" + " with", "i"),
  new RegExp("AI" + " generated", "i"),
  new RegExp("as an" + " AI", "i"),
  new RegExp("Cla" + "ude", "i"),
  new RegExp("Co-Authored-By:.*(Cla" + "ude|G" + "PT|Copilot)", "i"),
  /sk-[A-Za-z0-9]{20,}/,
];

for (const file of result.stdout.split("\n").filter(Boolean)) {
  if (file === "package-lock.json") continue;
  if (file === ".gitignore" || file === ".dockerignore") continue;
  if (file === "scripts/public-hygiene.mjs") continue;
  if (file.startsWith("docs/") && (file.endsWith("prompt.md") || file === "docs/pre-public-hygiene.md" || file === "docs/security-audit.md")) continue;
  const content = await readFile(file, "utf8").catch(() => "");
  for (const pattern of blocked) {
    if (pattern.test(content)) {
      throw new Error(`public hygiene failed in ${file}: ${pattern}`);
    }
  }
}
