import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  CLIENT_ID: z.string().min(1),
  GUILD_ID: z.string().min(1),
  CH_EVENT_FORUM: z.string().min(1),
  CH_EVENT_ANNOUNCE: z.string().optional().default(""),
  CH_INTERNAL_ANNOUNCE: z.string().optional().default(""),
  CH_EXPENSE_LOG: z.string().optional().default(""),
  CH_MINUTES: z.string().optional().default(""),
  CH_FREE_CHAT: z.string().optional().default(""),
  CH_MEETING_VC: z.string().optional().default(""),
  ROLE_EVENT_LEAD: z.string().min(1),
  ROLE_EVENTER: z.string().min(1),
  DB_PATH: z.string().default("./data/bot.db"),
  TZ: z.literal("Asia/Tokyo").default("Asia/Tokyo"),
  LOG_LEVEL: z.string().default("info")
});

const env = envSchema.parse(process.env);

export const config = {
  discordToken: env.DISCORD_TOKEN,
  clientId: env.CLIENT_ID,
  guildId: env.GUILD_ID,
  channels: {
    eventForum: env.CH_EVENT_FORUM,
    eventAnnounce: env.CH_EVENT_ANNOUNCE,
    internalAnnounce: env.CH_INTERNAL_ANNOUNCE,
    expenseLog: env.CH_EXPENSE_LOG,
    minutes: env.CH_MINUTES,
    freeChat: env.CH_FREE_CHAT,
    meetingVc: env.CH_MEETING_VC
  },
  roles: {
    eventLead: env.ROLE_EVENT_LEAD,
    eventer: env.ROLE_EVENTER
  },
  dbPath: env.DB_PATH,
  timeZone: env.TZ,
  logLevel: env.LOG_LEVEL
} as const;

export type AppConfig = typeof config;
