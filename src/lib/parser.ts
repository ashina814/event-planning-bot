import type { EventStatus } from "../types/index.js";

const prefixes: Record<EventStatus, string> = {
  planning: "【企画中】",
  announcing: "【告知中】",
  announced: "【告知済】",
  in_progress: "【告知済】",
  done: "【完了】",
  cancelled: "【見送り】"
};

const prefixPattern = /^【(?:企画中|告知中|告知済|完了|見送り)】\s*/;

export function statusPrefix(status: EventStatus): string {
  return prefixes[status];
}

export function stripStatusPrefix(title: string): string {
  return title.replace(prefixPattern, "").trim();
}

export function titleWithStatusPrefix(status: EventStatus, title: string): string {
  return `${statusPrefix(status)}${stripStatusPrefix(title)}`;
}

export function parseDiscordUserId(input: string): string | null {
  const match = input.match(/\d{15,25}/);
  return match?.[0] ?? null;
}

export function parseDiscordSnowflake(input: string, position: "first" | "last" = "first"): string | null {
  const matches = input.match(/\d{15,25}/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  return position === "last" ? matches[matches.length - 1] ?? null : matches[0] ?? null;
}

export function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
