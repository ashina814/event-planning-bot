import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  CLIENT_ID: z.string().min(1),
  OWNER_ID: z.string().min(1),
  DB_PATH: z.string().default("./data/bot.db"),
  TZ: z.literal("Asia/Tokyo").default("Asia/Tokyo"),
  LOG_LEVEL: z.string().default("info")
});

const env = envSchema.parse(process.env);

export const config = {
  discordToken: env.DISCORD_TOKEN,
  clientId: env.CLIENT_ID,
  ownerId: env.OWNER_ID,
  dbPath: env.DB_PATH,
  timeZone: env.TZ,
  logLevel: env.LOG_LEVEL
} as const;

export type AppConfig = typeof config;
