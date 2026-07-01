import type { CommandModule } from "../types/index.js";
import { eventCommand } from "./event-new.js";
import { eventsCommand } from "./events.js";
import { helpCommand } from "./help.js";

export const commands: CommandModule[] = [eventCommand, eventsCommand, helpCommand];

export const commandMap = new Map(commands.map((command) => [command.data.name, command]));
