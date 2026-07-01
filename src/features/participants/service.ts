import type {
  Client,
  GuildMember,
  Message,
  MessageReaction,
  PartialMessage,
  PartialMessageReaction,
  PartialUser,
  User
} from "discord.js";
import type { EventsRepo } from "../../db/repos/events.js";
import type { ParticipantsRepo } from "../../db/repos/participants.js";
import type { RolesRepo } from "../../db/repos/roles.js";
import type { SettingsRepo } from "../../db/repos/settings.js";
import { parseDiscordSnowflake } from "../../lib/parser.js";
import { jstDateTimeToUnix, unixNow } from "../../lib/time.js";
import { isEventLead } from "../../lib/permission.js";
import type {
  EventRecord,
  EventRoleRecord,
  ParticipantsConfigRecord,
  ParticipantsCountRecord,
  ParticipantsMode,
  ReactionEmojiConfig
} from "../../types/index.js";

interface SetupInput {
  mode: ParticipantsMode;
  target: string;
  emojis: string;
  deadline: string;
}

export class ParticipantsPermissionError extends Error {
  override name = "ParticipantsPermissionError";
}

export class ParticipantsService {
  constructor(
    private readonly client: Client,
    private readonly participantsRepo: ParticipantsRepo,
    private readonly eventsRepo: EventsRepo,
    private readonly rolesRepo: RolesRepo,
    private readonly settingsRepo: SettingsRepo
  ) {}

  getPanel(threadId: string): {
    config: ParticipantsConfigRecord | null;
    counts: ParticipantsCountRecord[];
  } {
    return {
      config: this.participantsRepo.getConfig(threadId),
      counts: this.participantsRepo.listCounts(threadId)
    };
  }

  async setup(member: GuildMember, threadId: string, input: SetupInput): Promise<void> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    this.assertCanConfigure(member, roles);

    const deadlineAt = this.parseDeadline(event, input.deadline);
    const targetId = parseDiscordSnowflake(input.target, "last");
    if (!targetId) {
      throw new Error("対象は Discord URL、ID、#チャンネル、メッセージID のいずれかで入力してください。");
    }

    if (input.mode === "reaction") {
      const emojis = this.parseEmojiConfig(input.emojis);
      const channelId = this.extractChannelId(input.target) ?? event.thread_id;
      this.participantsRepo.upsertConfig({
        threadId,
        mode: "reaction",
        reactionTargetChannel: channelId,
        reactionTargetMsg: targetId,
        reactionEmojis: emojis,
        postTargetChannel: null,
        postTargetThread: null,
        deadlineAt
      });
      await this.seedReactionCounts(threadId, channelId, targetId, emojis);
      return;
    }

    this.participantsRepo.upsertConfig({
      threadId,
      mode: "post",
      reactionTargetChannel: null,
      reactionTargetMsg: null,
      reactionEmojis: null,
      postTargetChannel: targetId,
      postTargetThread: targetId,
      deadlineAt
    });
    await this.recountPostConfig(threadId);
  }

  async refresh(threadId: string): Promise<void> {
    const config = this.participantsRepo.getConfig(threadId);
    if (!config) {
      throw new Error("参加者カウント設定がありません。");
    }

    if (config.mode === "reaction") {
      const channelId = config.reaction_target_channel;
      const messageId = config.reaction_target_msg;
      if (!channelId || !messageId) {
        throw new Error("リアクション方式の対象設定が不完全です。");
      }
      await this.seedReactionCounts(threadId, channelId, messageId, this.parseStoredEmojis(config));
      return;
    }

    await this.recountPostConfig(threadId);
  }

  async handleReactionAdd(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
  ): Promise<void> {
    if (user.bot) {
      return;
    }

    const fullReaction = reaction.partial ? await reaction.fetch() : reaction;
    const messageId = fullReaction.message.id;
    const configs = this.participantsRepo.findReactionConfigs(messageId);
    if (configs.length === 0) {
      return;
    }

    const now = unixNow();
    for (const config of configs) {
      const label = this.labelForReaction(config, fullReaction);
      if (!label) {
        continue;
      }
      this.participantsRepo.incrementCount(
        config.thread_id,
        label,
        this.isLate(config, now),
        1,
        now
      );
    }
  }

  async handleReactionRemove(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
  ): Promise<void> {
    if (user.bot) {
      return;
    }

    const fullReaction = reaction.partial ? await reaction.fetch() : reaction;
    const messageId = fullReaction.message.id;
    const configs = this.participantsRepo.findReactionConfigs(messageId);
    if (configs.length === 0) {
      return;
    }

    const now = unixNow();
    for (const config of configs) {
      const label = this.labelForReaction(config, fullReaction);
      if (!label) {
        continue;
      }
      this.participantsRepo.incrementCount(
        config.thread_id,
        label,
        this.isLate(config, now),
        -1,
        now
      );
    }
  }

  async handleMessageChange(message: Message | PartialMessage): Promise<void> {
    const channelId = message.channelId;
    const configs = this.participantsRepo.findPostConfigs(channelId);
    for (const config of configs) {
      await this.recountPostConfig(config.thread_id);
    }
  }

  private async seedReactionCounts(
    threadId: string,
    channelId: string,
    messageId: string,
    emojis: ReactionEmojiConfig[]
  ): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !("messages" in channel)) {
      throw new Error("リアクション対象メッセージのチャンネルを取得できません。");
    }

    const message = await channel.messages.fetch(messageId);
    const counts = emojis.map((emoji) => {
      const reaction = message.reactions.cache.find((item) => this.reactionKey(item) === emoji.emoji);
      return {
        label: emoji.label,
        normal: Math.max(0, (reaction?.count ?? 0) - (reaction?.me ? 1 : 0)),
        late: 0
      };
    });

    this.participantsRepo.replaceCounts(threadId, counts, unixNow());
  }

  private async recountPostConfig(threadId: string): Promise<void> {
    const config = this.participantsRepo.getConfig(threadId);
    if (!config || config.mode !== "post") {
      return;
    }

    const targetId = config.post_target_thread ?? config.post_target_channel;
    if (!targetId) {
      return;
    }

    const channel = await this.client.channels.fetch(targetId);
    if (!channel || !("messages" in channel)) {
      throw new Error("投稿方式の対象チャンネル/スレッドを取得できません。");
    }

    const messages = await channel.messages.fetch({ limit: 100 });
    let normal = 0;
    let late = 0;
    for (const message of messages.values()) {
      if (message.author?.bot) {
        continue;
      }
      const createdAt = Math.floor(message.createdTimestamp / 1000);
      if (this.isLate(config, createdAt)) {
        late += 1;
      } else {
        normal += 1;
      }
    }

    this.participantsRepo.replaceCounts(
      threadId,
      [{ label: "_post", normal, late }],
      unixNow()
    );
  }

  private parseEmojiConfig(input: string): ReactionEmojiConfig[] {
    const parts = input
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0 || parts.length > 3) {
      throw new Error("リアクション絵文字は 1 から 3 個で指定してください。");
    }

    return parts.map((part) => {
      const [emoji, label] = part.split(":").map((value) => value.trim());
      if (!emoji || !label) {
        throw new Error("絵文字設定は `絵文字:ラベル` をカンマ区切りで入力してください。");
      }
      return { emoji, label };
    });
  }

  private parseDeadline(event: EventRecord, input: string): number | null {
    const trimmed = input.trim();
    if (!trimmed) {
      return event.scheduled_at;
    }
    return jstDateTimeToUnix(trimmed);
  }

  private extractChannelId(input: string): string | null {
    const match = input.match(/channels\/\d+\/(\d+)\/\d+/);
    return match?.[1] ?? null;
  }

  private labelForReaction(
    config: ParticipantsConfigRecord,
    reaction: MessageReaction
  ): string | null {
    const configs = this.parseStoredEmojis(config);
    return configs.find((item) => item.emoji === this.reactionKey(reaction))?.label ?? null;
  }

  private reactionKey(reaction: MessageReaction): string {
    return reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : String(reaction.emoji.name);
  }

  private parseStoredEmojis(config: ParticipantsConfigRecord): ReactionEmojiConfig[] {
    if (!config.reaction_emojis) {
      return [];
    }
    return JSON.parse(config.reaction_emojis) as ReactionEmojiConfig[];
  }

  private isLate(config: ParticipantsConfigRecord, timestamp: number): boolean {
    return Boolean(config.deadline_at && timestamp > config.deadline_at);
  }

  private assertCanConfigure(member: GuildMember, roles: EventRoleRecord[]): void {
    if (isEventLead(member, this.settingsRepo)) {
      return;
    }

    const isMain = roles.some((role) => role.role_type === "main" && role.user_id === member.id);
    if (!isMain) {
      throw new ParticipantsPermissionError("参加者カウント設定は主担当・イベント統括のみ可能です。");
    }
  }

  private requireEvent(threadId: string): EventRecord {
    const event = this.eventsRepo.get(threadId);
    if (!event) {
      throw new Error("イベントが DB に見つかりません。");
    }
    return event;
  }
}
