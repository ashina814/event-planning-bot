import type Database from "better-sqlite3";
import type {
  ParticipantsConfigRecord,
  ParticipantsCountRecord,
  ParticipantsMode,
  ReactionEmojiConfig
} from "../../types/index.js";

interface UpsertConfigInput {
  threadId: string;
  mode: ParticipantsMode;
  reactionTargetChannel: string | null;
  reactionTargetMsg: string | null;
  reactionEmojis: ReactionEmojiConfig[] | null;
  postTargetChannel: string | null;
  postTargetThread: string | null;
  deadlineAt: number | null;
}

export class ParticipantsRepo {
  constructor(private readonly db: Database.Database) {}

  upsertConfig(input: UpsertConfigInput): void {
    this.db
      .prepare(
        `INSERT INTO participants_config (
          thread_id, mode, reaction_target_channel, reaction_target_msg,
          reaction_emojis, post_target_channel, post_target_thread, deadline_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET
          mode = excluded.mode,
          reaction_target_channel = excluded.reaction_target_channel,
          reaction_target_msg = excluded.reaction_target_msg,
          reaction_emojis = excluded.reaction_emojis,
          post_target_channel = excluded.post_target_channel,
          post_target_thread = excluded.post_target_thread,
          deadline_at = excluded.deadline_at`
      )
      .run(
        input.threadId,
        input.mode,
        input.reactionTargetChannel,
        input.reactionTargetMsg,
        input.reactionEmojis ? JSON.stringify(input.reactionEmojis) : null,
        input.postTargetChannel,
        input.postTargetThread,
        input.deadlineAt
      );
  }

  getConfig(threadId: string): ParticipantsConfigRecord | null {
    return (
      this.db.prepare("SELECT * FROM participants_config WHERE thread_id = ?").get(threadId) as
        | ParticipantsConfigRecord
        | undefined
    ) ?? null;
  }

  listConfigs(): ParticipantsConfigRecord[] {
    return this.db.prepare("SELECT * FROM participants_config").all() as ParticipantsConfigRecord[];
  }

  findReactionConfigs(messageId: string): ParticipantsConfigRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM participants_config
         WHERE mode = 'reaction' AND reaction_target_msg = ?`
      )
      .all(messageId) as ParticipantsConfigRecord[];
  }

  findPostConfigs(channelId: string): ParticipantsConfigRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM participants_config
         WHERE mode = 'post'
           AND (post_target_channel = ? OR post_target_thread = ?)`
      )
      .all(channelId, channelId) as ParticipantsConfigRecord[];
  }

  listCounts(threadId: string): ParticipantsCountRecord[] {
    return this.db
      .prepare("SELECT * FROM participants_count_cache WHERE thread_id = ? ORDER BY label ASC")
      .all(threadId) as ParticipantsCountRecord[];
  }

  replaceCounts(
    threadId: string,
    counts: Array<{ label: string; normal: number; late: number }>,
    now: number
  ): void {
    const tx = this.db.transaction(() => {
      this.db.prepare("DELETE FROM participants_count_cache WHERE thread_id = ?").run(threadId);
      const insert = this.db.prepare(
        `INSERT INTO participants_count_cache (
          thread_id, label, count_normal, count_late, updated_at
        ) VALUES (?, ?, ?, ?, ?)`
      );
      for (const count of counts) {
        insert.run(threadId, count.label, count.normal, count.late, now);
      }
    });

    tx();
  }

  incrementCount(
    threadId: string,
    label: string,
    late: boolean,
    delta: number,
    now: number
  ): void {
    const current = this.db
      .prepare(
        `SELECT * FROM participants_count_cache
         WHERE thread_id = ? AND label = ?`
      )
      .get(threadId, label) as ParticipantsCountRecord | undefined;

    let normal = current?.count_normal ?? 0;
    let lateCount = current?.count_late ?? 0;

    if (delta >= 0) {
      if (late) {
        lateCount += delta;
      } else {
        normal += delta;
      }
    } else if (late) {
      if (lateCount > 0) {
        lateCount += delta;
      } else {
        normal += delta;
      }
    } else if (normal > 0) {
      normal += delta;
    } else {
      lateCount += delta;
    }

    normal = Math.max(0, normal);
    lateCount = Math.max(0, lateCount);

    this.db
      .prepare(
        `INSERT INTO participants_count_cache (
          thread_id, label, count_normal, count_late, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(thread_id, label) DO UPDATE SET
          count_normal = excluded.count_normal,
          count_late = excluded.count_late,
          updated_at = excluded.updated_at`
      )
      .run(threadId, label, normal, lateCount, now);
  }
}
