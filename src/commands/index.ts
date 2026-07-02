import type { CommandModule } from "../types/index.js";
import { adminCommand } from "./admin.js";
import { eventCommand } from "./event-new.js";
import { eventsCommand } from "./events.js";
import { helpCommand } from "./help.js";
import { monthlyCommand } from "./monthly.js";

export const commands: CommandModule[] = [eventCommand, eventsCommand, helpCommand, adminCommand, monthlyCommand];

export const commandMap = new Map(commands.map((command) => [command.data.name, command]));
