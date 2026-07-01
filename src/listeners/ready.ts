import { Events, type Client } from "discord.js";
import { logger } from "../lib/logger.js";
import type { SchedulerRunner } from "../scheduler/runner.js";

export function registerReadyListener(client: Client, scheduler: SchedulerRunner): void {
  client.once(Events.ClientReady, (readyClient) => {
    logger.info({ user: readyClient.user.tag }, "bot ready");
    scheduler.start();
  });
}
