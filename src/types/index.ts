export const eventStatuses = [
  "planning",
  "announcing",
  "announced",
  "in_progress",
  "done",
  "cancelled"
] as const;

export type EventStatus = (typeof eventStatuses)[number];

export const roleTypes = [
  "main",
  "mc",
  "announce",
  "record",
  "prize",
  "support"
] as const;

export type RoleType = (typeof roleTypes)[number];

export interface EventRecord {
  thread_id: string;
  series_id: number | null;
  title: string;
  status: EventStatus;
  scheduled_at: number | null;
  control_msg_id: string | null;
  parent_msg_id: string | null;
  created_by: string;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
}

export interface EventRoleRecord {
  thread_id: string;
  role_type: RoleType;
  user_id: string;
  assigned_at: number;
}

export interface SeriesRecord {
  id: number;
  name: string;
  description: string | null;
  created_at: number;
  archived: number;
}

export interface SeriesSectionRecord {
  id: number;
  series_id: number;
  ord: number;
  name: string;
  default_minutes: number | null;
  per_person_sec: number | null;
}

export interface SectionHistoryRecord {
  id: number;
  series_id: number;
  section_name: string;
  thread_id: string;
  participants: number | null;
  actual_minutes: number;
  ts: number;
}

export interface HandoverRecord {
  id: number;
  thread_id: string;
  role_type: RoleType;
  from_user: string | null;
  to_user: string;
  reason: string | null;
  pending_tasks: string | null;
  declared_msg_id: string | null;
  ts: number;
}

export interface TimerScheduleRecord {
  id: number;
  thread_id: string;
  notify_channel: string;
  mention_role: string | null;
  pre_notice_min: number;
  state: "idle" | "running" | "finished";
  created_at: number;
}

export interface TimerSectionRecord {
  id: number;
  schedule_id: number;
  ord: number;
  name: string;
  planned_start: number;
  planned_minutes: number;
  actual_start: number | null;
  actual_end: number | null;
}

export interface AnnouncementRecord {
  id: number;
  thread_id: string;
  body: string;
  created_by: string;
  created_at: number;
  posted_msg_id: string | null;
  posted_at: number | null;
  scheduled_at: number | null;
}

export type ParticipantsMode = "reaction" | "post";

export interface ReactionEmojiConfig {
  emoji: string;
  label: string;
}

export interface ParticipantsConfigRecord {
  thread_id: string;
  mode: ParticipantsMode;
  reaction_target_channel: string | null;
  reaction_target_msg: string | null;
  reaction_emojis: string | null;
  post_target_channel: string | null;
  post_target_thread: string | null;
  deadline_at: number | null;
}

export interface ParticipantsCountRecord {
  thread_id: string;
  label: string;
  count_normal: number;
  count_late: number;
  updated_at: number;
}

export interface TodoRecord {
  id: number;
  thread_id: string | null;
  content: string;
  assignee: string | null;
  due_at: number | null;
  status: "open" | "done" | "cancelled";
  created_by: string;
  created_at: number;
  done_at: number | null;
  source: string | null;
  source_msg_id: string | null;
}

export const expenseCategories = ["prize", "gift", "operation", "other"] as const;
export type ExpenseCategory = (typeof expenseCategories)[number];

export const expenseDirections = ["out", "in"] as const;
export type ExpenseDirection = (typeof expenseDirections)[number];

export const expenseThresholdKinds = ["per_tx", "per_event", "per_month"] as const;
export type ExpenseThresholdKind = (typeof expenseThresholdKinds)[number];

export interface ExpenseRecord {
  id: number;
  thread_id: string | null;
  category: ExpenseCategory;
  amount: number;
  direction: ExpenseDirection;
  recipient_id: string | null;
  responder_id: string;
  proof_url: string | null;
  proof_msg_id: string | null;
  memo: string | null;
  occurred_at: number;
  created_at: number;
  proof_status: "attached" | "pending_proof";
}

export interface ExpenseThresholdRecord {
  id: number;
  kind: ExpenseThresholdKind;
  threshold: number;
  enabled: number;
  updated_at: number;
}

export interface ScheduledJobRecord {
  id: number;
  kind: string;
  payload: string;
  fire_at: number;
  status: "pending" | "processing" | "fired" | "skipped" | "failed";
  fired_at: number | null;
  error: string | null;
  created_at: number;
}

export interface CommandModule {
  data: {
    name: string;
    toJSON(): unknown;
  };
  execute(interaction: import("discord.js").ChatInputCommandInteraction): Promise<void>;
}
