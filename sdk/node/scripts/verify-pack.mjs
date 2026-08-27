// Packs the SDK and installs the tarball into throwaway ESM and CJS
// consumers, so CI exercises the real export map and file list rather than
// the source tree. Catches "works from src, broken from the tarball" bugs:
// missing dist, wrong exports conditions, files absent from the package.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const sdkDir = resolve(new URL("..", import.meta.url).pathname);

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8" });
}

// prepack still fires (that is part of what this verifies); background
// scripts keep the build logs out of the JSON on stdout.
const packed = JSON.parse(run("npm", ["pack", "--json", "--foreground-scripts=false"], sdkDir));
const tarball = join(sdkDir, packed[0].filename);
const files = packed[0].files.map(f => f.path);

for (const required of ["dist/index.js", "dist/index.cjs", "dist/index.d.ts", "dist/index.d.cts", "LICENSE", "README.md"]) {
  if (!files.includes(required)) {
    throw new Error(`tarball is missing ${required}; got: ${files.join(", ")}`);
  }
}

const work = mkdtempSync(join(tmpdir(), "sdk-pack-"));
try {
  writeFileSync(join(work, "package.json"), JSON.stringify({ name: "fixture", private: true }));
  run("npm", ["install", "--no-audit", "--no-fund", tarball], work);

  writeFileSync(
    join(work, "esm.mjs"),
    `import { BottleneckAuthClient, verifyWebhookSignature } from "@bottleneck/auth-sdk";
if (typeof BottleneckAuthClient !== "function" || typeof verifyWebhookSignature !== "function") {
  throw new Error("ESM import surface is broken");
}
new BottleneckAuthClient({ issuer: "https://auth.test" });
`,
  );
  writeFileSync(
    join(work, "cjs.cjs"),
    `const { BottleneckAuthClient } = require("@bottleneck/auth-sdk");
if (typeof BottleneckAuthClient !== "function") {
  throw new Error("CJS require surface is broken");
}
new BottleneckAuthClient({ issuer: "https://auth.test" });
`,
  );

  run("node", ["esm.mjs"], work);
  run("node", ["cjs.cjs"], work);
  console.log(`ok: ${packed[0].filename} installs and loads as ESM and CJS`);
} finally {
  rmSync(work, { recursive: true, force: true });
  rmSync(tarball, { force: true });
}
