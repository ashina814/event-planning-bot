import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
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
