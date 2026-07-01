import type Database from "better-sqlite3";
import type {
  SectionHistoryRecord,
  SeriesRecord,
  SeriesSectionRecord
} from "../../types/index.js";

export class SeriesRepo {
  constructor(private readonly db: Database.Database) {}

  findById(id: number): SeriesRecord | null {
    return (
      this.db.prepare("SELECT * FROM series WHERE id = ?").get(id) as SeriesRecord | undefined
    ) ?? null;
  }

  findByName(name: string): SeriesRecord | null {
    return (
      this.db.prepare("SELECT * FROM series WHERE name = ?").get(name) as SeriesRecord | undefined
    ) ?? null;
  }

  findOrCreate(name: string, now: number): SeriesRecord {
    const trimmed = name.trim();
    const existing = this.findByName(trimmed);
    if (existing) {
      return existing;
    }

    const result = this.db
      .prepare("INSERT INTO series (name, description, created_at, archived) VALUES (?, NULL, ?, 0)")
      .run(trimmed, now);

    return {
      id: Number(result.lastInsertRowid),
      name: trimmed,
      description: null,
      created_at: now,
      archived: 0
    };
  }

  listActive(limit = 25): SeriesRecord[] {
    return this.db
      .prepare("SELECT * FROM series WHERE archived = 0 ORDER BY name ASC LIMIT ?")
      .all(limit) as SeriesRecord[];
  }

  listSections(seriesId: number): SeriesSectionRecord[] {
    return this.db
      .prepare("SELECT * FROM series_sections WHERE series_id = ? ORDER BY ord ASC")
      .all(seriesId) as SeriesSectionRecord[];
  }

  upsertSection(
    seriesId: number,
    ord: number,
    name: string,
    defaultMinutes: number | null,
    perPersonSec: number | null
  ): void {
    this.db
      .prepare(
        `INSERT INTO series_sections (
          series_id, ord, name, default_minutes, per_person_sec
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(series_id, ord) DO UPDATE SET
          name = excluded.name,
          default_minutes = excluded.default_minutes,
          per_person_sec = excluded.per_person_sec`
      )
      .run(seriesId, ord, name, defaultMinutes, perPersonSec);
  }

  addSectionHistory(
    seriesId: number,
    sectionName: string,
    threadId: string,
    participants: number | null,
    actualMinutes: number,
    now: number
  ): void {
    this.db
      .prepare(
        `INSERT INTO section_history (
          series_id, section_name, thread_id, participants, actual_minutes, ts
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(seriesId, sectionName, threadId, participants, actualMinutes, now);
  }

  historyForSection(seriesId: number, sectionName: string, limit = 5): SectionHistoryRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM section_history
         WHERE series_id = ? AND section_name = ?
         ORDER BY ts DESC
         LIMIT ?`
      )
      .all(seriesId, sectionName, limit) as SectionHistoryRecord[];
  }
}
