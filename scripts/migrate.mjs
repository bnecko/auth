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

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const existing = await client.query(
      `select 1 from schema_migrations where version = $1`,
      [version],
    );

    if (existing.rowCount) {
      continue;
    }

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
} finally {
  await client.end();
}
