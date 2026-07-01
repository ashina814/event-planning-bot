import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import { commands } from "./commands/index.js";
import { logger } from "./lib/logger.js";

const rest = new REST({ version: "10" }).setToken(config.discordToken);

logger.info("registering guild slash commands");
await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
  body: commands.map((command) => command.data.toJSON())
});
logger.info("slash commands registered");
