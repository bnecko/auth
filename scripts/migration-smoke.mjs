import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function dbUrl(name) {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function withAdminClient(fn) {
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end();
  }
}

async function recreateDatabase(name) {
  await withAdminClient(async client => {
    await client.query(`drop database if exists ${name}`);
    await client.query(`create database ${name}`);
  });
}

async function runMigrate(url) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/migrate.mjs"], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "inherit",
    });
    child.on("exit", code => {
      if (code === 0) resolve();
      else reject(new Error(`migration exited with ${code}`));
    });
    child.on("error", reject);
  });
}

async function applySchema(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(await readFile(path.join(root, "db", "schema.sql"), "utf8"));
  } finally {
    await client.end();
  }
}

const suffix = `${process.pid}_${Date.now()}`;
const fresh = `auth_migrate_fresh_${suffix}`;
const upgrade = `auth_migrate_upgrade_${suffix}`;

try {
  await recreateDatabase(fresh);
  await runMigrate(dbUrl(fresh));
  await runMigrate(dbUrl(fresh));

  await recreateDatabase(upgrade);
  await applySchema(dbUrl(upgrade));
  await runMigrate(dbUrl(upgrade));
  await runMigrate(dbUrl(upgrade));
} finally {
  await withAdminClient(async client => {
    await client.query(`drop database if exists ${fresh}`);
    await client.query(`drop database if exists ${upgrade}`);
  });
}
