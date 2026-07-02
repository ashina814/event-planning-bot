import type {
  ActionRowBuilder,
  ButtonBuilder,
  Client,
  GuildMember,
  Message,
  MessageReaction,
  PartialMessage,
  PartialMessageReaction,
  PartialUser,
  User
} from "discord.js";
import { ActionRowBuilder as DiscordActionRowBuilder, ButtonBuilder as DiscordButtonBuilder, ButtonStyle } from "discord.js";
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
import { participantsLabels } from "../../ui/labels.js";

interface SetupInput {
  mode: ParticipantsMode;
  target: string;
  emojis: string;
  deadline: string;
}

interface ReactionSetupSession {
  purpose: "config" | "announcement";
  threadId: string;
  targetChannel: string | null;
  targetMsg: string | null;
  announcementSessionId: string | null;
  setupChannel: string;
  setupMsg: string;
  userId: string;
  emojis: string[];
}

const reactionSetupSessions = new Map<string, ReactionSetupSession>();

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

  async beginReactionEmojiSetup(
    member: GuildMember,
    threadId: string,
    targetChannel: string,
    targetMsg: string
  ): Promise<Message> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    this.assertCanConfigure(member, roles);

    const channel = await this.client.channels.fetch(targetChannel);
    if (!channel || !("send" in channel)) {
      throw new Error("対象メッセージのチャンネルにセットアップメッセージを投稿できませんでした。");
    }

    const setupMessage = await channel.send({
      content: [
        "👤 **参加者カウントのセットアップ**",
        "",
        "このメッセージに、リアクションで絵文字を 2 つ押してください。",
        "",
        "1. 「参加」用の絵文字を先に",
        "2. 「不参加」用の絵文字を後に",
        "",
        "押し終わったら [これで確定] を押してください。Nitro絵文字も使えます。"
      ].join("\n")
    });
    await setupMessage.edit({
      components: this.buildReactionSetupComponents(threadId, setupMessage.id)
    });

    reactionSetupSessions.set(setupMessage.id, {
      purpose: "config",
      threadId,
      targetChannel,
      targetMsg,
      announcementSessionId: null,
      setupChannel: setupMessage.channelId,
      setupMsg: setupMessage.id,
      userId: member.id,
      emojis: []
    });

    return setupMessage;
  }

  async beginAnnouncementEmojiSetup(
    member: GuildMember,
    threadId: string,
    announcementSessionId: string
  ): Promise<Message> {
    this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    this.assertCanConfigure(member, roles);

    const channel = await this.client.channels.fetch(threadId);
    if (!channel || !("send" in channel)) {
      throw new Error("イベントスレッドにセットアップメッセージを投稿できませんでした。");
    }

    const setupMessage = await channel.send({
      content: [
        "👤 **告知の参加者カウント用絵文字セットアップ**",
        "",
        "このメッセージに、リアクションで絵文字を 2 つ押してください。",
        "",
        "1. 「参加」用の絵文字を先に",
        "2. 「不参加」用の絵文字を後に",
        "",
        "押し終わったら [これで確定] を押してください。"
      ].join("\n")
    });
    await setupMessage.edit({
      components: this.buildAnnouncementEmojiSetupComponents(announcementSessionId, threadId, setupMessage.id)
    });

    reactionSetupSessions.set(setupMessage.id, {
      purpose: "announcement",
      threadId,
      targetChannel: null,
      targetMsg: null,
      announcementSessionId,
      setupChannel: setupMessage.channelId,
      setupMsg: setupMessage.id,
      userId: member.id,
      emojis: []
    });

    return setupMessage;
  }

  async confirmReactionEmojiSetup(
    member: GuildMember,
    threadId: string,
    setupMsg: string
  ): Promise<void> {
    const session = reactionSetupSessions.get(setupMsg);
    if (!session || session.threadId !== threadId) {
      throw new Error("参加者カウントのセットアップが見つかりませんでした。もう一度やり直してください。");
    }
    if (session.userId !== member.id) {
      throw new ParticipantsPermissionError("セットアップを開始した本人だけが確定できます。");
    }
    if (session.emojis.length !== 2) {
      throw new Error("参加用と不参加用の絵文字を2つ押してから確定してください。");
    }
    if (session.purpose !== "config" || !session.targetChannel || !session.targetMsg) {
      throw new Error("参加者カウントのセットアップ種別が一致しません。");
    }

    const event = this.requireEvent(threadId);
    const emojis = this.sessionEmojisAsConfigs(session);

    this.participantsRepo.upsertConfig({
      threadId,
      mode: "reaction",
      reactionTargetChannel: session.targetChannel,
      reactionTargetMsg: session.targetMsg,
      reactionEmojis: emojis,
      postTargetChannel: null,
      postTargetThread: null,
      deadlineAt: event.scheduled_at
    });
    await this.seedReactionCounts(threadId, session.targetChannel, session.targetMsg, emojis);
    reactionSetupSessions.delete(setupMsg);
    await this.deleteSetupMessage(session);
  }

  async confirmAnnouncementEmojiSetup(
    member: GuildMember,
    threadId: string,
    setupMsg: string
  ): Promise<ReactionEmojiConfig[]> {
    const session = reactionSetupSessions.get(setupMsg);
    if (!session || session.threadId !== threadId || session.purpose !== "announcement") {
      throw new Error("告知用の絵文字セットアップが見つかりませんでした。もう一度やり直してください。");
    }
    if (session.userId !== member.id) {
      throw new ParticipantsPermissionError("セットアップを開始した本人だけが確定できます。");
    }
    if (session.emojis.length !== 2) {
      throw new Error("参加用と不参加用の絵文字を2つ押してから確定してください。");
    }

    const emojis = this.sessionEmojisAsConfigs(session);
    reactionSetupSessions.delete(setupMsg);
    await this.deleteSetupMessage(session);
    return emojis;
  }

  async cancelReactionEmojiSetup(member: GuildMember, threadId: string, setupMsg: string): Promise<void> {
    const session = reactionSetupSessions.get(setupMsg);
    if (!session || session.threadId !== threadId) {
      return;
    }
    if (session.userId !== member.id) {
      throw new ParticipantsPermissionError("セットアップを開始した本人だけがキャンセルできます。");
    }
    reactionSetupSessions.delete(setupMsg);
    await this.deleteSetupMessage(session);
  }

  async cancelAnnouncementEmojiSetup(member: GuildMember, threadId: string, setupMsg: string): Promise<void> {
    const session = reactionSetupSessions.get(setupMsg);
    if (!session || session.threadId !== threadId || session.purpose !== "announcement") {
      return;
    }
    if (session.userId !== member.id) {
      throw new ParticipantsPermissionError("セットアップを開始した本人だけがキャンセルできます。");
    }
    reactionSetupSessions.delete(setupMsg);
    await this.deleteSetupMessage(session);
  }

  async setupPostChannel(member: GuildMember, threadId: string, channelId: string): Promise<void> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    this.assertCanConfigure(member, roles);

    this.participantsRepo.upsertConfig({
      threadId,
      mode: "post",
      reactionTargetChannel: null,
      reactionTargetMsg: null,
      reactionEmojis: null,
      postTargetChannel: channelId,
      postTargetThread: channelId,
      deadlineAt: event.scheduled_at
    });
    await this.recountPostConfig(threadId);
  }

  async setup(member: GuildMember, threadId: string, input: SetupInput): Promise<void> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    this.assertCanConfigure(member, roles);

    const targetId = parseDiscordSnowflake(input.target, "last");
    if (!targetId) {
      throw new Error("対象は Discord URL、ID、#チャンネル、メッセージID のいずれかで入力してください。");
    }

    if (input.mode === "reaction") {
      const channelId = this.extractChannelId(input.target) ?? event.thread_id;
      await this.configureReactionMode(member, threadId, channelId, targetId, input.emojis, input.deadline);
      return;
    }

    const deadlineAt = this.parseDeadline(event, input.deadline);

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

  async configureReactionMode(
    member: GuildMember,
    threadId: string,
    targetChannel: string,
    targetMsg: string,
    emojisInput: string,
    deadlineInput: string
  ): Promise<void> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    this.assertCanConfigure(member, roles);

    const emojis = this.parseEmojiConfig(emojisInput);
    const deadlineAt = this.parseDeadline(event, deadlineInput);
    this.participantsRepo.upsertConfig({
      threadId,
      mode: "reaction",
      reactionTargetChannel: targetChannel,
      reactionTargetMsg: targetMsg,
      reactionEmojis: emojis,
      postTargetChannel: null,
      postTargetThread: null,
      deadlineAt
    });
    await this.seedReactionCounts(threadId, targetChannel, targetMsg, emojis);
  }

  getConfiguredReactionEmojis(threadId: string): ReactionEmojiConfig[] | null {
    const config = this.participantsRepo.getConfig(threadId);
    if (!config?.reaction_emojis) {
      return null;
    }

    try {
      const emojis = this.parseStoredEmojis(config);
      return emojis.length === 2 ? emojis : null;
    } catch {
      return null;
    }
  }

  async configureReactionModeFromMessage(
    threadId: string,
    targetChannel: string,
    targetMsg: string,
    emojis: ReactionEmojiConfig[]
  ): Promise<void> {
    if (emojis.length !== 2) {
      throw new Error("参加者カウントに使う絵文字を2つ設定してください。");
    }

    const event = this.requireEvent(threadId);
    this.participantsRepo.upsertConfig({
      threadId,
      mode: "reaction",
      reactionTargetChannel: targetChannel,
      reactionTargetMsg: targetMsg,
      reactionEmojis: emojis,
      postTargetChannel: null,
      postTargetThread: null,
      deadlineAt: event.scheduled_at
    });
    await this.seedReactionCounts(threadId, targetChannel, targetMsg, emojis);
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

  async clear(member: GuildMember, threadId: string): Promise<void> {
    this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    this.assertCanConfigure(member, roles);
    this.participantsRepo.deleteConfig(threadId);
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
    if (await this.recordSetupReaction(fullReaction, user)) {
      return;
    }

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
    if (this.removeSetupReaction(fullReaction, user)) {
      return;
    }

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

  private buildReactionSetupComponents(
    threadId: string,
    setupMsg: string
  ): ActionRowBuilder<ButtonBuilder>[] {
    return [
      new DiscordActionRowBuilder<DiscordButtonBuilder>().addComponents(
        new DiscordButtonBuilder()
          .setCustomId(`participants:setup-confirm:${threadId}:${setupMsg}`)
          .setLabel("これで確定")
          .setStyle(ButtonStyle.Primary),
        new DiscordButtonBuilder()
          .setCustomId(`participants:setup-cancel:${threadId}:${setupMsg}`)
          .setLabel("キャンセル")
          .setStyle(ButtonStyle.Secondary)
      )
    ];
  }

  private buildAnnouncementEmojiSetupComponents(
    announcementSessionId: string,
    threadId: string,
    setupMsg: string
  ): ActionRowBuilder<ButtonBuilder>[] {
    return [
      new DiscordActionRowBuilder<DiscordButtonBuilder>().addComponents(
        new DiscordButtonBuilder()
          .setCustomId(`ann:emoji-confirm:${announcementSessionId}:${threadId}:${setupMsg}`)
          .setLabel("これで確定")
          .setStyle(ButtonStyle.Primary),
        new DiscordButtonBuilder()
          .setCustomId(`ann:emoji-cancel:${announcementSessionId}:${threadId}:${setupMsg}`)
          .setLabel("キャンセル")
          .setStyle(ButtonStyle.Secondary)
      )
    ];
  }

  private sessionEmojisAsConfigs(session: ReactionSetupSession): ReactionEmojiConfig[] {
    return session.emojis.map((emoji, index) => ({
      emoji,
      label: participantsLabels[index] ?? participantsLabels[0]
    }));
  }

  private async deleteSetupMessage(session: ReactionSetupSession): Promise<void> {
    const channel = await this.client.channels.fetch(session.setupChannel).catch(() => null);
    if (!channel || !("messages" in channel)) {
      return;
    }
    const message = await channel.messages.fetch(session.setupMsg).catch(() => null);
    await message?.delete().catch(() => null);
  }

  private async recordSetupReaction(
    reaction: MessageReaction,
    user: User | PartialUser
  ): Promise<boolean> {
    const session = reactionSetupSessions.get(reaction.message.id);
    if (!session) {
      return false;
    }
    if (user.id !== session.userId) {
      return true;
    }

    const emoji = this.reactionKey(reaction);
    if (session.emojis.includes(emoji)) {
      return true;
    }
    if (session.emojis.length >= 2) {
      await reaction.users.remove(user.id).catch(() => null);
      return true;
    }
    session.emojis.push(emoji);
    return true;
  }

  private removeSetupReaction(
    reaction: MessageReaction,
    user: User | PartialUser
  ): boolean {
    const session = reactionSetupSessions.get(reaction.message.id);
    if (!session) {
      return false;
    }
    if (user.id !== session.userId) {
      return true;
    }

    const emoji = this.reactionKey(reaction);
    session.emojis = session.emojis.filter((item) => item !== emoji);
    return true;
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
      [
        { label: participantsLabels[0], normal, late },
        { label: participantsLabels[1], normal: 0, late: 0 }
      ],
      unixNow()
    );
  }

  private parseEmojiConfig(input: string): ReactionEmojiConfig[] {
    const parts = input
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length !== 2) {
      throw new Error("リアクション絵文字は参加用・不参加用の2つで指定してください。");
    }

    return parts.map((part, index) => {
      const [emoji] = part.split(":").map((value) => value.trim());
      if (!emoji) {
        throw new Error("リアクション絵文字が読めませんでした。");
      }
      return { emoji, label: participantsLabels[index] ?? participantsLabels[0] };
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
    const stored = JSON.parse(config.reaction_emojis) as ReactionEmojiConfig[];
    return stored.slice(0, 2).map((item, index) => ({
      emoji: item.emoji,
      label: participantsLabels[index] ?? participantsLabels[0]
    }));
  }

  private isLate(config: ParticipantsConfigRecord, timestamp: number): boolean {
    return Boolean(config.deadline_at && timestamp > config.deadline_at);
  }

  private assertCanConfigure(member: GuildMember, roles: EventRoleRecord[]): void {
    if (isEventLead(member, this.settingsRepo)) {
      return;
    }

    const isMain = roles.some(
      (role) => (role.role_kind === "main" || role.role_type === "main") && role.user_id === member.id
    );
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
