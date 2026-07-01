import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import { commands } from "./commands/index.js";
import { registerAnnouncementCommandData } from "./commands/register-announcement.js";
import { setParticipantsTargetCommandData } from "./commands/set-participants-target.js";
import { logger } from "./lib/logger.js";

const rest = new REST({ version: "10" }).setToken(config.discordToken);

logger.info("registering global application commands");
await rest.put(Routes.applicationCommands(config.clientId), {
  body: [
    ...commands.map((command) => command.data.toJSON()),
    registerAnnouncementCommandData.toJSON(),
    setParticipantsTargetCommandData.toJSON()
  ]
});
logger.info("application commands registered");
