import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationsDir = path.join(root, "db", "migrations");
const checkOnly = process.argv.includes("--check");

// Migrations must be named NNN_name.sql with a strictly ascending numeric
// prefix. Catch a misnamed or out-of-order file before it is applied (or
// silently skipped by the sort), since order is load-bearing.
function validateMigrationFiles(files) {
  let lastNum = -1;
  for (const file of files) {
    const match = /^(\d+)_.+\.sql$/.exec(file);
    if (!match) {
      throw new Error(`invalid migration filename (expected NNN_name.sql): ${file}`);
    }
    const num = Number(match[1]);
    if (num <= lastNum) {
      throw new Error(
        `migration files out of order at ${file} (prefix ${num} not greater than previous ${lastNum})`,
      );
    }
    lastNum = num;
  }
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter(file => file.endsWith(".sql"))
    .sort();

  validateMigrationFiles(files);

  const applied = new Set(
    (await client.query(`select version from schema_migrations`)).rows.map(r => r.version),
  );
  const pending = files.filter(file => !applied.has(file.replace(/\.sql$/, "")));

  if (checkOnly) {
    // Dry run for CI / pre-deploy: report pending migrations, change nothing.
    if (pending.length === 0) {
      console.log("migrations: up to date");
    } else {
      console.log(`migrations: ${pending.length} pending`);
      for (const file of pending) console.log(`  ${file}`);
    }
  } else {
    for (const file of pending) {
      const version = file.replace(/\.sql$/, "");
      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          `insert into schema_migrations (version) values ($1)`,
          [version],
        );
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
    }
  }
} finally {
  await client.end();
}
