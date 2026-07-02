import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";

let database: Database.Database | null = null;

function readSchema(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), "src/db/schema.sql"),
    resolve(here, "schema.sql"),
    resolve(here, "../../src/db/schema.sql")
  ];

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, "utf8");
    } catch {
      // Try the next path. Development and built layouts differ.
    }
  }

  throw new Error("src/db/schema.sql が見つかりません。");
}

function migrationDirs(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    resolve(process.cwd(), "src/db/migrations"),
    resolve(here, "migrations"),
    resolve(here, "../../src/db/migrations")
  ];
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function hasTable(db: Database.Database, table: string): boolean {
  const row = db
    .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { found: number } | undefined;
  return Boolean(row);
}

function markMigrationApplied(db: Database.Database, name: string): void {
  db.prepare("INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, strftime('%s','now'))")
    .run(name);
}

function runMigrations(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )`
  );

  const migrationsDir = migrationDirs().find((candidate) => existsSync(candidate));
  if (!migrationsDir) {
    return;
  }

  const migrations = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const name of migrations) {
    const applied = db
      .prepare("SELECT 1 FROM schema_migrations WHERE name = ?")
      .get(name);
    if (applied) {
      continue;
    }

    if (name === "001_roles_rebuild.sql" && hasColumn(db, "event_roles", "role_kind")) {
      markMigrationApplied(db, name);
      continue;
    }

    if (name === "002_announcement_sources.sql" && hasColumn(db, "announcements", "source_channel_id")) {
      markMigrationApplied(db, name);
      continue;
    }

    if (name === "003_jobs_thread.sql" && hasColumn(db, "scheduled_jobs", "thread_id")) {
      markMigrationApplied(db, name);
      continue;
    }

    if (name === "004_announcement_participants.sql" && hasColumn(db, "announcements", "enable_participants")) {
      markMigrationApplied(db, name);
      continue;
    }

    if (name === "005_expense_corrections.sql" && hasColumn(db, "expenses", "voided")) {
      markMigrationApplied(db, name);
      continue;
    }

    if (name === "006_participants_frozen.sql" && hasColumn(db, "participants_config", "frozen")) {
      markMigrationApplied(db, name);
      continue;
    }

    if (
      name === "007_d1_foundation.sql" &&
      hasColumn(db, "events", "scale") &&
      hasColumn(db, "event_roles", "confirmed_at") &&
      hasTable(db, "audit_log")
    ) {
      markMigrationApplied(db, name);
      continue;
    }

    const sql = readFileSync(resolve(migrationsDir, name), "utf8");
    const tx = db.transaction(() => {
      db.exec(sql);
      markMigrationApplied(db, name);
    });
    tx();
    logger.info({ migration: name }, "database migration applied");
  }
}

export function getDb(): Database.Database {
  if (database) {
    return database;
  }

  const dbPath = resolve(process.cwd(), config.dbPath);
  mkdirSync(dirname(dbPath), { recursive: true });

  database = new Database(dbPath);
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.exec(readSchema());
  runMigrations(database);

  logger.info({ dbPath }, "database opened");
  return database;
}

export function closeDb(): void {
  if (!database) {
    return;
  }

  database.close();
  database = null;
}
