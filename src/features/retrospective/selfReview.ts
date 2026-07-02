import type Database from "better-sqlite3";
import { EmbedBuilder, type Client } from "discord.js";
import type { SettingsRepo } from "../../db/repos/settings.js";
import { formatJstDateTime, unixNow } from "../../lib/time.js";
import { buildSelfReviewPanelComponents } from "../../ui/buttons.js";

export interface SelfReviewRecord {
  id: number;
  user_id: string;
  month_key: string;
  did: string | null;
  good: string | null;
  hard: string | null;
  want_next: string | null;
  improve: string | null;
  need_support: string | null;
  submitted_at: number | null;
  updated_at: number;
}

export interface SelfReviewPage1 {
  did: string;
  good: string;
  hard: string;
}

export interface SelfReviewPage2 {
  wantNext: string;
  improve: string;
  needSupport: string;
}

interface PanelRef {
  channelId: string;
  messageId: string;
}

export class SelfReviewService {
  constructor(
    private readonly db: Database.Database,
    private readonly settingsRepo: SettingsRepo
  ) {}

  getReview(userId: string, monthKey: string): SelfReviewRecord | null {
    return (
      (this.db
        .prepare("SELECT * FROM self_reviews WHERE user_id = ? AND month_key = ?")
        .get(userId, monthKey) as SelfReviewRecord | undefined) ?? null
    );
  }

  /** 1 枚目の 3 項目を途中保存する。submitted_at は変更しない (未提出のまま)。 */
  savePartial(userId: string, monthKey: string, page: SelfReviewPage1): void {
    const now = unixNow();
    this.db
      .prepare(
        `INSERT INTO self_reviews (user_id, month_key, did, good, hard, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, month_key) DO UPDATE SET
           did = excluded.did,
           good = excluded.good,
           hard = excluded.hard,
           updated_at = excluded.updated_at`
      )
      .run(userId, monthKey, page.did.trim() || null, page.good.trim() || null, page.hard.trim() || null, now);
  }

  /** 2 枚目の 3 項目を保存し、submitted_at を確定する。 */
  submit(userId: string, monthKey: string, page: SelfReviewPage2): SelfReviewRecord {
    const now = unixNow();
    this.db
      .prepare(
        `INSERT INTO self_reviews (user_id, month_key, want_next, improve, need_support, submitted_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, month_key) DO UPDATE SET
           want_next = excluded.want_next,
           improve = excluded.improve,
           need_support = excluded.need_support,
           submitted_at = excluded.submitted_at,
           updated_at = excluded.updated_at`
      )
      .run(
        userId,
        monthKey,
        page.wantNext.trim() || null,
        page.improve.trim() || null,
        page.needSupport.trim() || null,
        now,
        now
      );
    const record = this.getReview(userId, monthKey);
    if (!record) {
      throw new Error("振り返りの保存に失敗しました。");
    }
    return record;
  }

  hasSubmitted(userId: string, monthKey: string): boolean {
    const row = this.db
      .prepare(
        "SELECT 1 AS found FROM self_reviews WHERE user_id = ? AND month_key = ? AND submitted_at IS NOT NULL"
      )
      .get(userId, monthKey) as { found: number } | undefined;
    return Boolean(row);
  }

  listSubmitters(monthKey: string): string[] {
    return (
      this.db
        .prepare(
          "SELECT user_id FROM self_reviews WHERE month_key = ? AND submitted_at IS NOT NULL ORDER BY submitted_at ASC"
        )
        .all(monthKey) as Array<{ user_id: string }>
    ).map((row) => row.user_id);
  }

  /** 提出を期待する母数 = グレード登録済みユーザー数。 */
  expectedCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM user_grades").get() as { count: number };
    return row.count;
  }

  buildPanelPayload(monthKey: string): {
    content: string;
    components: ReturnType<typeof buildSelfReviewPanelComponents>;
  } {
    const submitters = this.listSubmitters(monthKey);
    const expected = this.expectedCount();
    const submittedLine =
      submitters.length > 0
        ? `提出済み: ${submitters.slice(0, 20).map((id) => `<@${id}>`).join(" ")}${submitters.length > 20 ? " ほか" : ""} (${submitters.length}/${expected})`
        : `提出済み: まだいません (0/${expected})`;
    const unsubmitted = Math.max(0, expected - submitters.length);

    return {
      content: [
        `📝 **${monthKey} の振り返り**`,
        "今月の振り返りを提出してください。評価の一方通行を防ぎ、次の担当配置の参考にします。",
        "",
        submittedLine,
        expected > 0 ? `未提出: ${unsubmitted} 人` : null,
        "",
        "下の [提出する] から入力してください。6 項目を 2 画面に分けて入力します。"
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
      components: buildSelfReviewPanelComponents(monthKey)
    };
  }

  /** イベンターお知らせ (internalAnnounce) に提出パネルを投稿 or 更新する。 */
  async ensurePanel(client: Client, monthKey: string): Promise<void> {
    const channelId = this.settingsRepo.getOptional("internalAnnounce");
    if (!channelId) {
      return;
    }
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !("send" in channel) || !("messages" in channel)) {
      return;
    }

    const payload = this.buildPanelPayload(monthKey);
    const ref = this.getPanelRef(monthKey);
    if (ref && ref.channelId === channelId) {
      const message = await channel.messages.fetch(ref.messageId).catch(() => null);
      if (message) {
        await message.edit(payload);
        return;
      }
    }

    const sent = await channel.send(payload);
    this.setPanelRef(monthKey, { channelId, messageId: sent.id });
  }

  /** 提出/更新のたびに呼ばれ、パネルの「提出済み」表示を更新する。 */
  async refreshPanel(client: Client, monthKey: string): Promise<void> {
    const ref = this.getPanelRef(monthKey);
    if (!ref) {
      await this.ensurePanel(client, monthKey);
      return;
    }
    const channel = await client.channels.fetch(ref.channelId).catch(() => null);
    if (!channel || !("messages" in channel)) {
      return;
    }
    const message = await channel.messages.fetch(ref.messageId).catch(() => null);
    if (!message) {
      await this.ensurePanel(client, monthKey);
      return;
    }
    await message.edit(this.buildPanelPayload(monthKey));
  }

  /** 提出内容を統括専用チャンネルへ全文転送する。 */
  async forwardToLead(client: Client, record: SelfReviewRecord): Promise<void> {
    const channelId = this.settingsRepo.getOptional("leadOnly");
    if (!channelId) {
      return;
    }
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !("send" in channel)) {
      return;
    }
    await channel.send({ embeds: [buildSelfReviewEmbed(record)] });
  }

  private getPanelRef(monthKey: string): PanelRef | null {
    const row = this.db
      .prepare("SELECT value FROM reward_settings WHERE key = ?")
      .get(this.panelKey(monthKey)) as { value: string } | undefined;
    if (!row) {
      return null;
    }
    try {
      return JSON.parse(row.value) as PanelRef;
    } catch {
      return null;
    }
  }

  private setPanelRef(monthKey: string, ref: PanelRef): void {
    this.db
      .prepare(
        `INSERT INTO reward_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(this.panelKey(monthKey), JSON.stringify(ref), unixNow());
  }

  private panelKey(monthKey: string): string {
    return `self_review_panel:${monthKey}`;
  }
}

export function buildSelfReviewEmbed(record: SelfReviewRecord): EmbedBuilder {
  const field = (value: string | null): string => {
    const text = (value ?? "").trim();
    return text ? text.slice(0, 1000) : "(記入なし)";
  };
  const embed = new EmbedBuilder()
    .setTitle(`📝 振り返り ${record.month_key}`)
    .setDescription(`<@${record.user_id}>`)
    .addFields(
      { name: "今月やったこと", value: field(record.did) },
      { name: "できたこと", value: field(record.good) },
      { name: "難しかったこと", value: field(record.hard) },
      { name: "次にやってみたい担当", value: field(record.want_next) },
      { name: "改善したいこと", value: field(record.improve) },
      { name: "サポートしてほしいこと", value: field(record.need_support) }
    );
  if (record.submitted_at) {
    embed.setFooter({ text: `提出 ${formatJstDateTime(record.submitted_at)}` });
  }
  return embed;
}
