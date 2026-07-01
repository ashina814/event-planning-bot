import type Database from "better-sqlite3";
import type { BotSettingRecord, BotSettings, SettingKey } from "../../types/index.js";
import { settingKeys } from "../../types/index.js";

export class SettingsRepo {
  constructor(private readonly db: Database.Database) {}

  get(key: SettingKey): string {
    return this.getOptional(key) ?? "";
  }

  getOptional(key: SettingKey): string | null {
    const row = this.db
      .prepare("SELECT * FROM bot_settings WHERE key = ?")
      .get(key) as BotSettingRecord | undefined;
    return row?.value?.trim() || null;
  }

  require(key: SettingKey, label: string): string {
    const value = this.getOptional(key);
    if (!value) {
      throw new Error(`${label} が未設定です。/admin の管理パネルで設定してください。`);
    }
    return value;
  }

  all(): BotSettings {
    const rows = this.db.prepare("SELECT * FROM bot_settings").all() as BotSettingRecord[];
    const settings: BotSettings = {};
    rows.forEach((row) => {
      if ((settingKeys as readonly string[]).includes(row.key)) {
        settings[row.key] = row.value;
      }
    });
    return settings;
  }

  set(key: SettingKey, value: string, now: number): void {
    const trimmed = value.trim();
    if (!trimmed) {
      this.db.prepare("DELETE FROM bot_settings WHERE key = ?").run(key);
      return;
    }

    this.db
      .prepare(
        `INSERT INTO bot_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`
      )
      .run(key, trimmed, now);
  }

  setMany(values: Partial<Record<SettingKey, string>>, now: number): void {
    const tx = this.db.transaction(() => {
      for (const [key, value] of Object.entries(values) as Array<[SettingKey, string]>) {
        this.set(key, value, now);
      }
    });
    tx();
  }
}
